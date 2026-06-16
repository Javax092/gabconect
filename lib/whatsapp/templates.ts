export const TEMPLATE_NOT_APPROVED = "TEMPLATE_NOT_APPROVED";
export const WHATSAPP_TEST_TEMPLATE = "hello_world";

export function getApprovedTemplateNames() {
  return (process.env.WHATSAPP_APPROVED_TEMPLATES ?? "")
    .split(",")
    .map((template) => template.trim())
    .filter(Boolean);
}

export function getApprovedTemplateConfigSummary() {
  return {
    configured: getApprovedTemplateNames().length > 0,
    count: getApprovedTemplateNames().length,
  };
}

export function isApprovedTemplate(templateName: string): boolean {
  return getApprovedTemplateNames().includes(templateName.trim());
}

export function isDevelopmentHelloWorldFallback(templateName: string): boolean {
  return process.env.NODE_ENV !== "production" && templateName.trim() === WHATSAPP_TEST_TEMPLATE;
}

export function validateApprovedTemplateForRealSend(templateName: string) {
  const normalizedTemplateName = templateName.trim();
  const approved = isApprovedTemplate(normalizedTemplateName);
  const developmentFallback = isDevelopmentHelloWorldFallback(normalizedTemplateName);
  const allowed = approved || developmentFallback;

  if (!allowed) {
    console.warn("[whatsapp:template_blocked_not_approved]", {
      templateName: normalizedTemplateName,
      approvedConfigured: getApprovedTemplateNames().length,
      developmentFallbackAvailable: process.env.NODE_ENV !== "production",
      suggestion: `Use ${WHATSAPP_TEST_TEMPLATE} em ambiente de teste.`,
    });
  }

  return {
    allowed,
    approved,
    developmentFallback,
    code: allowed ? null : TEMPLATE_NOT_APPROVED,
    message: allowed
      ? null
      : "Template não aprovado na Meta. Use um template aprovado ou hello_world para teste.",
  };
}
