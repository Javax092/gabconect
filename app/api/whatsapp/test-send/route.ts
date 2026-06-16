import { NextResponse } from "next/server";
import {
  ContactStatus,
  SendAttemptStatus,
  WhatsAppMessageLogDirection,
  WhatsAppMessageLogStatus,
  WhatsAppTemplateStatus
} from "@prisma/client";

import { ApiRouteError, apiError, apiSuccess, readJson } from "@/lib/api";
import { getMandateContext, requireAuth } from "@/lib/auth";
import { isWhatsAppDryRunEnabled } from "@/lib/campaign-execution";
import { invalidateWhatsAppOperationalCache } from "@/lib/operational-cache";
import { prisma } from "@/lib/prisma";
import { assertRateLimit, getClientIp, redactPhone } from "@/lib/security";
import { runSendGate } from "@/lib/send-gate";
import { recordSendAttempt } from "@/lib/send-attempts";
import {
  type MetaWhatsAppTemplate,
  WhatsAppApiError,
  assertWhatsAppReadyForRealSend,
  buildWhatsAppTemplateComponents,
  sendWhatsAppTemplateRequest
} from "@/lib/whatsapp";
import { normalizePhone } from "@/lib/whatsapp-campaigns";
import {
  WHATSAPP_TEST_TEMPLATE,
  validateApprovedTemplateForRealSend
} from "@/lib/whatsapp/templates";
import { isWhatsAppTestBypassAllowed } from "@/lib/whatsapp-test-bypass";

export const runtime = "nodejs";

function assertMetaConfigForRealSend() {
  const missing = [
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_BUSINESS_ACCOUNT_ID",
    "WHATSAPP_API_VERSION"
  ].filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new ApiRouteError(
      409,
      `Configuração Meta ausente para envio real: ${missing.join(", ")}. Mantenha WHATSAPP_DRY_RUN="true" até homologar.`,
      "WHATSAPP_META_CONFIG_MISSING",
      { missing }
    );
  }
}

export async function POST(request: Request) {
  try {
    assertRateLimit({
      key: `whatsapp:test-send:${getClientIp(request)}`,
      limit: 5,
      windowMs: 15 * 60_000
    });

    const internalToken = request.headers.get("x-internal-test-token");
    const envInternalToken = process.env.INTERNAL_TEST_TOKEN;
    const isInternalTest = Boolean(
      process.env.NODE_ENV !== "production" &&
        envInternalToken &&
        internalToken === envInternalToken
    );
    console.log("WHATSAPP_DRY_RUN RAW:", process.env.WHATSAPP_DRY_RUN);
    console.log("DRY RUN ENABLED:", isWhatsAppDryRunEnabled());
    const dryRun = isWhatsAppDryRunEnabled();

    const user = isInternalTest
      ? await prisma.user.findFirst({
          where: {
            email: (process.env.ADMIN_DEFAULT_EMAIL || "admin@gabinete.com").trim().toLowerCase()
          },
          include: {
            mandate: true
          }
        })
      : await requireAuth();

    if (!user) {
      throw new ApiRouteError(
        401,
        "Usuário não encontrado para teste interno.",
        "TEST_USER_NOT_FOUND"
      );
    }
    const { mandateId } = getMandateContext(user);
    const body = await readJson(request).catch(() => ({}));
    const confirmed = Boolean(
      body && typeof body === "object" && "confirmed" in body ? body.confirmed : false
    );
    const requestedTemplateName =
      body && typeof body === "object" && "templateName" in body && typeof body.templateName === "string"
        ? body.templateName.trim()
        : null;

    if (!confirmed) {
      throw new ApiRouteError(
        400,
        "Confirme que o teste será feito com contato próprio e opt-in ativo.",
        "TEST_CONFIRMATION_REQUIRED"
      );
    }

    const recipientPhone = normalizePhone(
      process.env.WHATSAPP_TEST_RECIPIENT_PHONE || user.mandate.whatsappNumber
    );

    if (!recipientPhone) {
      throw new ApiRouteError(
        400,
        "Defina WHATSAPP_TEST_RECIPIENT_PHONE ou o número WhatsApp do mandato.",
        "TEST_RECIPIENT_MISSING"
      );
    }

    const [contact, template] = await Promise.all([
      prisma.contact.findFirst({
        where: {
          mandateId,
          phone: recipientPhone,
          optIn: true,
          status: ContactStatus.ACTIVE
        },
        select: {
          id: true,
          name: true,
          phone: true
        }
      }),
      prisma.whatsAppTemplate.findFirst({
        where: {
          mandateId,
          status: WhatsAppTemplateStatus.APPROVED,
          ...(requestedTemplateName ? { metaTemplateName: requestedTemplateName } : {})
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          name: true,
          metaTemplateName: true,
          language: true,
          category: true,
          body: true
        }
      })
    ]);

    if (!contact) {
      throw new ApiRouteError(
        400,
        "Cadastre o telefone de teste como contato ativo com opt-in antes de enviar.",
        "TEST_CONTACT_NOT_OPTED_IN"
      );
    }

    const templateForSend =
      template ??
      (requestedTemplateName === WHATSAPP_TEST_TEMPLATE
        ? {
            id: null,
            name: WHATSAPP_TEST_TEMPLATE,
            metaTemplateName: WHATSAPP_TEST_TEMPLATE,
            language: "en_US",
            category: null,
            body: ""
          }
        : null);

    if (!templateForSend) {
      throw new ApiRouteError(
        400,
        requestedTemplateName
          ? "Template não encontrado entre os templates aprovados cadastrados para este mandato."
          : "Cadastre ao menos um template aprovado pela Meta antes do teste.",
        "APPROVED_TEMPLATE_MISSING"
      );
    }

    if (!dryRun) {
      assertMetaConfigForRealSend();
    }

    const templateNameForSend = templateForSend.metaTemplateName;
    const templateLanguageForSend = templateForSend.language;
    const phoneForSend = normalizePhone(contact.phone);
    const templateValidation = validateApprovedTemplateForRealSend(templateNameForSend);

    console.info("[whatsapp:test-send:template_validation]", {
      templateName: templateNameForSend,
      dryRun,
      approved: templateValidation.approved,
      developmentFallback: templateValidation.developmentFallback,
      allowed: templateValidation.allowed,
    });

    if (!dryRun && !templateValidation.allowed) {
      throw new ApiRouteError(
        400,
        "Template não aprovado na Meta. Use um template aprovado ou hello_world para teste.",
        "TEMPLATE_NOT_APPROVED",
        {
          templateName: templateNameForSend,
          suggestion: "Use hello_world em ambiente de teste.",
        }
      );
    }

    if (!/^\d{10,15}$/.test(phoneForSend)) {
      throw new ApiRouteError(
        400,
        "Telefone de teste deve estar em E.164 sem '+', exemplo 5592999999999.",
        "INVALID_TEST_PHONE",
        { phone: phoneForSend }
      );
    }

    const gate = await runSendGate({
      mandateId,
      contactId: contact.id,
      phone: phoneForSend,
      templateId: templateForSend.id,
      templateName: templateNameForSend,
      kind: "TEST",
      dryRun
    });
    let sendDryRun = dryRun;

    if (!gate.allowed) {
      const bypass = isInternalTest
        ? {
            allowed: false,
            reason: "Bypass exige usuário autenticado ADMIN."
          }
        : isWhatsAppTestBypassAllowed({
            user,
            to: phoneForSend
          });

      if (!bypass.allowed) {
        console.warn("[whatsapp:test-send:bypass-denied]", {
          gateReason: gate.reason,
          bypassReason: bypass.reason,
          phone: redactPhone(phoneForSend),
          role: user.role
        });

        return NextResponse.json(
          {
            success: false,
            code: "SEND_GATE_BLOCKED",
            message: `Envio bloqueado pelo gate de segurança: ${gate.reason}`,
            reason: bypass.reason
          },
          { status: 409 }
        );
      }

      console.warn("[whatsapp:test-send:bypass-enabled]", {
        gateReason: gate.reason,
        bypassReason: bypass.reason,
        phone: redactPhone(phoneForSend),
        role: user.role
      });
      sendDryRun = false;
      assertMetaConfigForRealSend();
    }

    if (!sendDryRun) {
      const ready = await assertWhatsAppReadyForRealSend({
        templateName: templateNameForSend,
        language: templateLanguageForSend,
        category: templateForSend.category,
        localBody: templateForSend.body || null
      });
      const components = buildWhatsAppTemplateComponents({
        localBody: templateForSend.body,
        metaTemplate: "template" in ready ? (ready.template as MetaWhatsAppTemplate | null) : null,
        contact: {
          name: contact.name
        }
      });

      console.info("[whatsapp:test-send:real-send]", {
        bypass: !gate.allowed,
        phone: redactPhone(phoneForSend),
        templateName: templateNameForSend,
        language: templateLanguageForSend,
        componentsCount: components?.length ?? 0
      });

      const sent = await sendWhatsAppTemplateRequest({
        phone: phoneForSend,
        templateName: templateNameForSend,
        language: templateLanguageForSend,
        components
      });

      await prisma.whatsAppMessageLog.create({
        data: {
          mandateId,
          contactId: contact.id,
          templateId: templateForSend.id,
          direction: WhatsAppMessageLogDirection.OUTBOUND,
          status: WhatsAppMessageLogStatus.ACCEPTED,
          providerMessageId: sent.providerMessageId,
          phone: phoneForSend,
          payload: {
            test: true,
            templateName: templateNameForSend,
            language: templateLanguageForSend,
            components,
            phone: redactPhone(phoneForSend),
            response: {
              providerMessageId: sent.providerMessageId
            }
          },
          sentAt: new Date()
        }
      });
      await recordSendAttempt({
        mandateId,
        contactId: contact.id,
        phone: phoneForSend,
        template: templateNameForSend,
        status: SendAttemptStatus.SENT,
        reason: "Teste WhatsApp aceito pela Meta.",
        providerMessageId: sent.providerMessageId,
        metadata: {
          test: true
        }
      });

      invalidateWhatsAppOperationalCache(mandateId);

      return apiSuccess({
        data: {
          mode: "REAL",
          providerMessageId: sent.providerMessageId,
          template: templateForSend.name,
          message: "Teste enviado com template aprovado."
        }
      });
    }

    if (sendDryRun) {
      await prisma.whatsAppMessageLog.create({
        data: {
          mandateId,
          contactId: contact.id,
          templateId: templateForSend.id,
          direction: WhatsAppMessageLogDirection.OUTBOUND,
          status: WhatsAppMessageLogStatus.SIMULATED_SENT,
          phone: phoneForSend,
          payload: {
            test: true,
            simulated: true,
            templateName: templateNameForSend,
            language: templateLanguageForSend,
            phone: redactPhone(phoneForSend)
          },
          sentAt: new Date()
        }
      });

      invalidateWhatsAppOperationalCache(mandateId);
      await recordSendAttempt({
        mandateId,
        contactId: contact.id,
        phone: phoneForSend,
        template: templateNameForSend,
        status: SendAttemptStatus.SIMULATED,
        reason: "Teste WhatsApp simulado.",
        metadata: {
          test: true
        }
      });

      return apiSuccess({
        data: {
          mode: "SIMULACAO",
          template: templateForSend.name,
          message: "Teste simulado registrado sem chamar a Meta."
        }
      });
    }

    throw new ApiRouteError(500, "Fluxo de envio real não finalizado.", "WHATSAPP_TEST_SEND_FAILED");
  } catch (error) {
    return apiError(
      error instanceof ApiRouteError
        ? error
        : error instanceof WhatsAppApiError
          ? new ApiRouteError(
              error.status === 401 ? 401 : 409,
              error.message,
              error.code === 190 ? "TOKEN_INVALID" : "WHATSAPP_TEST_SEND_FAILED",
              {
                status: error.status,
                code: error.code,
                retryable: error.retryable,
                details: error.details
              }
            )
        : new ApiRouteError(
            400,
            error instanceof Error ? error.message : "Não foi possível concluir o teste.",
            "WHATSAPP_TEST_SEND_FAILED"
          )
    );
  }
}
