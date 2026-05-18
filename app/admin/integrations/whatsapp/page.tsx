import {
  CheckCircle2,
  CopyCheck,
  Globe,
  KeyRound,
  LockKeyhole,
  PlugZap,
  ShieldCheck
} from "lucide-react";

import { CopyButton } from "@/components/admin/copy-button";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { DemoIntegrationPage } from "@/components/demo/demo-pages";
import { requireUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";
import { env } from "@/lib/env";

function maskValue(value: string) {
  if (value.length <= 6) {
    return "Configurado";
  }

  return `${value.slice(0, 3)}••••${value.slice(-3)}`;
}

export default async function WhatsAppIntegrationPage() {
  if (isDemoMode()) {
    return <DemoIntegrationPage />;
  }

  const user = await requireUser();

  const hasAccessToken = Boolean(process.env.WHATSAPP_ACCESS_TOKEN);
  const hasPhoneNumberId = Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID);
  const hasVerifyToken = Boolean(process.env.WHATSAPP_VERIFY_TOKEN);
  const isConnected = hasAccessToken && hasPhoneNumberId && hasVerifyToken;
  const webhookUrl = `${env.appUrl}/api/webhooks/whatsapp`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Integrações"
        title="WhatsApp oficial do gabinete"
        description="Conecte o canal institucional à Meta, valide o webhook e preserve a segurança operacional sem expor credenciais."
        icon={<PlugZap className="h-5 w-5" />}
        aside={
          <div
            className={`rounded-[22px] border px-5 py-4 text-sm font-medium ${
              isConnected
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            {isConnected ? "Integração configurada" : "Configuração pendente"}
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
        <SectionCard>
          <div className="grid gap-4 md:grid-cols-2">
            <InfoCard
              title="Status da integração"
              value={isConnected ? "Conectada" : "Aguardando configuração"}
              icon={<ShieldCheck className="h-5 w-5" />}
            />
            <InfoCard
              title="Número configurado"
              value={user.mandate.whatsappNumber}
              icon={<CopyCheck className="h-5 w-5" />}
            />
            <InfoCard
              title="Webhook"
              value={webhookUrl}
              icon={<Globe className="h-5 w-5" />}
              compact
            />
            <InfoCard
              title="Phone Number ID"
              value={hasPhoneNumberId ? maskValue(process.env.WHATSAPP_PHONE_NUMBER_ID ?? "") : "Não configurado"}
              icon={<KeyRound className="h-5 w-5" />}
            />
          </div>
        </SectionCard>

        <SectionCard className="bg-slate-950 text-white">
          <h2 className="text-lg font-semibold">Boas práticas</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-white/75">
            <p>Os tokens não aparecem nesta tela, mesmo para usuários autenticados.</p>
            <p>Use o número institucional do gabinete para manter histórico e governança.</p>
            <p>Se a Meta trocar credenciais, atualize apenas as variáveis de ambiente.</p>
          </div>
        </SectionCard>
      </div>

      <SectionCard>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">URL do webhook</h2>
            <p className="mt-1 text-sm text-slate-600">
              Copie esta URL e configure no painel da Meta. Ela recebe eventos de entrada e retorno do WhatsApp Business.
            </p>
            <code className="mt-4 block overflow-x-auto rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {webhookUrl}
            </code>
          </div>
          <CopyButton value={webhookUrl} />
        </div>
      </SectionCard>

      <SectionCard>
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-brand-50 p-3 text-brand-700">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Checklist de conexão com a Meta</h2>
            <p className="mt-1 text-sm text-slate-600">
              Itens mínimos para uma demonstração comercial convincente e segura.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {[
            {
              label: "Número do WhatsApp Business configurado no mandato",
              done: Boolean(user.mandate.whatsappNumber)
            },
            {
              label: "WHATSAPP_ACCESS_TOKEN disponível no ambiente",
              done: hasAccessToken
            },
            {
              label: "WHATSAPP_PHONE_NUMBER_ID disponível no ambiente",
              done: hasPhoneNumberId
            },
            {
              label: "WHATSAPP_VERIFY_TOKEN disponível no ambiente",
              done: hasVerifyToken
            },
            {
              label: "Webhook público apontando para a aplicação",
              done: Boolean(env.appUrl)
            },
            {
              label: "Fluxo pronto para registrar mensagens e respostas",
              done: true
            }
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-start gap-3 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4"
            >
              <span
                className={`mt-0.5 h-3.5 w-3.5 rounded-full ${
                  item.done ? "bg-emerald-500" : "bg-amber-400"
                }`}
              />
              <p className="text-sm leading-6 text-slate-600">{item.label}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard>
          <div className="flex items-center gap-3">
            <Globe className="h-5 w-5 text-brand-600" />
            <h2 className="text-lg font-semibold text-slate-950">Instruções resumidas</h2>
          </div>
          <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
            <p>1. Cadastre o número do WhatsApp Business que será usado pelo gabinete.</p>
            <p>2. No app da Meta, informe a URL do webhook e o `verify token` configurado no ambiente.</p>
            <p>3. Ative eventos de mensagens para que as conversas entrem automaticamente no painel.</p>
            <p>4. Teste com uma mensagem real e valide se a IA registra e orienta sem expor credenciais.</p>
          </div>
        </SectionCard>

        <SectionCard className="bg-[linear-gradient(180deg,_#fff7ed_0%,_#ffffff_100%)]">
          <div className="flex items-center gap-3">
            <LockKeyhole className="h-5 w-5 text-amber-700" />
            <h2 className="text-lg font-semibold text-slate-950">Aviso de segurança</h2>
          </div>
          <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
            <p>Nenhum token de acesso deve ser exibido no frontend ou compartilhado em demonstrações.</p>
            <p>Mostre apenas status, número configurado e webhook público. Credenciais ficam restritas ao ambiente do servidor.</p>
            <p>Isso protege a operação do mandato e mantém o produto vendável para clientes reais.</p>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function InfoCard({
  title,
  value,
  icon,
  compact = false
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <article className="rounded-[26px] border border-slate-200 bg-slate-50 p-5">
      <div className="flex items-center gap-3 text-slate-700">
        <div className="rounded-2xl bg-white p-3 shadow-sm">{icon}</div>
        <p className="text-sm font-medium">{title}</p>
      </div>
      <p className={`mt-4 font-semibold text-slate-950 ${compact ? "break-all text-sm" : "text-xl"}`}>
        {value}
      </p>
    </article>
  );
}
