"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, Upload, UserPlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage } from "@/lib/utils";

type ContactItem = {
  id: string;
  code: string;
  name: string;
  phone: string;
  source: string;
  tags: string[];
  optIn: boolean;
  optInAt: string | null;
  status: "ACTIVE" | "UNSUBSCRIBED" | "BLOCKED" | "INVALID";
  birthday: string | null;
  neighborhood: string | null;
  zone: string | null;
  city: string | null;
  role: string | null;
  influenceLevel: string | null;
  interestArea: string | null;
  politicalTemperature: string | null;
  relationshipType: string | null;
  nextAction: string | null;
  notes: string | null;
  lastInteractionAt: string | null;
  createdAt: string;
  updatedAt: string;
  invalidPhone: boolean;
};

type ContactsManagerProps = {
  initialContacts: ContactItem[];
};

const emptyForm = {
  name: "",
  phone: "",
  source: "manual",
  tags: "",
  birthday: "",
  optIn: false,
  status: "ACTIVE"
};

const roleOptions = [
  ["CITIZEN", "Cidadão comum"],
  ["COMMUNITY_LEADER", "Liderança comunitária"],
  ["RELIGIOUS_LEADER", "Liderança religiosa"],
  ["SPORTS_LEADER", "Liderança esportiva"],
  ["STUDENT_LEADER", "Liderança estudantil"],
  ["BUSINESS_OWNER", "Comerciante"],
  ["PUBLIC_SERVANT", "Servidor público"],
  ["ASSOCIATION_LEADER", "Liderança de associação"],
  ["ACTIVE_SUPPORTER", "Apoiador ativo"],
  ["COLD_SUPPORTER", "Apoiador frio"],
  ["UNDECIDED", "Indeciso"],
  ["SOCIAL_DEMAND", "Demanda social"],
  ["INSTITUTIONAL_CONTACT", "Contato institucional"]
] as const;

const influenceOptions = [
  ["LOW", "Baixa"],
  ["MEDIUM", "Média"],
  ["HIGH", "Alta"],
  ["VIP", "VIP"]
] as const;

const interestOptions = [
  ["HEALTH", "Saúde"],
  ["EDUCATION", "Educação"],
  ["INFRASTRUCTURE", "Infraestrutura"],
  ["SPORTS", "Esportes"],
  ["EMPLOYMENT", "Emprego"],
  ["SECURITY", "Segurança"],
  ["SOCIAL_ASSISTANCE", "Assistência social"],
  ["CULTURE", "Cultura"],
  ["OTHER", "Outra"]
] as const;

const temperatureOptions = [
  ["COLD", "Fria"],
  ["WARM", "Morna"],
  ["HOT", "Quente"],
  ["STRATEGIC", "Estratégica"]
] as const;

const relationshipOptions = [
  ["RESIDENT", "Morador"],
  ["LEADER", "Liderança"],
  ["SUPPORTER", "Apoiador"],
  ["INSTITUTIONAL", "Institucional"],
  ["DEMAND", "Demanda"],
  ["EVENT", "Evento"]
] as const;

const nextActionOptions = [
  ["CALL", "Ligar"],
  ["VISIT", "Visitar"],
  ["MESSAGE", "Mensagem"],
  ["MEETING", "Reunião"],
  ["FOLLOW_UP_DEMAND", "Acompanhar demanda"]
] as const;

const emptyQualification = {
  neighborhood: "",
  zone: "",
  role: "",
  influenceLevel: "",
  interestArea: "",
  politicalTemperature: "",
  relationshipType: "",
  nextAction: "",
  notes: ""
};

export function ContactsManager({ initialContacts }: ContactsManagerProps) {
  const [contacts, setContacts] = useState(initialContacts);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [optInFilter, setOptInFilter] = useState("ALL");
  const [form, setForm] = useState(emptyForm);
  const [csvContent, setCsvContent] = useState("name;phone;tags;optIn;birthday;status\n");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qualifyingContact, setQualifyingContact] = useState<ContactItem | null>(null);
  const [qualificationForm, setQualificationForm] = useState(emptyQualification);

  const filteredContacts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return contacts.filter((contact) => {
      const matchesQuery =
        !query ||
        contact.name.toLowerCase().includes(query) ||
        contact.phone.includes(query.replace(/[^\d]/g, "")) ||
        contact.code.toLowerCase().includes(query) ||
        (contact.neighborhood ?? "").toLowerCase().includes(query);
      const matchesStatus = statusFilter === "ALL" || contact.status === statusFilter;
      const matchesOptIn =
        optInFilter === "ALL" ||
        (optInFilter === "OPT_IN" ? contact.optIn : !contact.optIn);

      return matchesQuery && matchesStatus && matchesOptIn;
    });
  }, [contacts, optInFilter, search, statusFilter]);

  async function refreshContacts() {
    const params = new URLSearchParams();
    params.set("q", search);
    params.set("status", statusFilter);
    params.set("optIn", optInFilter);

    const response = await fetch(`/api/contacts?${params.toString()}`, { cache: "no-store" });
    const data = (await response.json()) as { contacts?: ContactItem[] };

    if (!response.ok || !data.contacts) {
      throw new Error(getApiErrorMessage(data, "Não foi possível atualizar os contatos."));
    }

    setContacts(data.contacts);
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFeedback(null);

    try {
      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mode: "single",
          ...form
        })
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        setError(getApiErrorMessage(data, "Não foi possível salvar o contato."));
        return;
      }

      setForm(emptyForm);
      setFeedback(data.message ?? "Contato salvo.");
      await refreshContacts();
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  async function handleImport() {
    setPending(true);
    setError(null);
    setFeedback(null);

    try {
      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mode: "csv",
          csvContent,
          source: "csv",
          defaultOptIn: false
        })
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        setError(getApiErrorMessage(data, "Não foi possível importar o CSV."));
        return;
      }

      setFeedback(data.message ?? "Importação concluída.");
      await refreshContacts();
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  function openQualification(contact: ContactItem) {
    setQualifyingContact(contact);
    setQualificationForm({
      neighborhood: contact.neighborhood ?? "",
      zone: contact.zone ?? "",
      role: contact.role ?? "",
      influenceLevel: contact.influenceLevel ?? "",
      interestArea: contact.interestArea ?? "",
      politicalTemperature: contact.politicalTemperature ?? "",
      relationshipType: contact.relationshipType ?? "",
      nextAction: contact.nextAction ?? "",
      notes: contact.notes ?? ""
    });
    setError(null);
    setFeedback(null);
  }

  async function handleQualificationSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!qualifyingContact) return;

    setPending(true);
    setError(null);
    setFeedback(null);

    try {
      const response = await fetch(`/api/contacts/${qualifyingContact.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mode: "qualification",
          ...qualificationForm
        })
      });
      const data = (await response.json()) as { contact?: ContactItem; message?: string };

      if (!response.ok || !data.contact) {
        setError(getApiErrorMessage(data, "Não foi possível qualificar o contato."));
        return;
      }

      setContacts((current) => current.map((contact) => (contact.id === data.contact?.id ? data.contact : contact)));
      setQualifyingContact(null);
      setFeedback(data.message ?? "Qualificação atualizada.");
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <form onSubmit={handleCreate} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="border-b border-slate-100 pb-4">
            <p className="text-sm font-semibold text-slate-950">Cadastro manual de contato</p>
            <p className="mt-1 text-sm text-slate-500">
              Cadastre o contato com telefone validado, opt-in visível e tags operacionais.
            </p>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nome do contato" />
            <Input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Telefone com DDI/DDD" />
            <Input value={form.tags} onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))} placeholder="Tags separadas por vírgula" />
            <Input type="date" value={form.birthday} onChange={(event) => setForm((current) => ({ ...current, birthday: event.target.value }))} />
            <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700">
              <option value="ACTIVE">Ativo</option>
              <option value="UNSUBSCRIBED">Opt-out</option>
              <option value="BLOCKED">Bloqueado</option>
              <option value="INVALID">Sem telefone</option>
            </select>
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <input type="checkbox" checked={form.optIn} onChange={(event) => setForm((current) => ({ ...current, optIn: event.target.checked }))} className="h-4 w-4" />
              Opt-in ativo
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <Button type="submit" className="gap-2" disabled={pending}>
              <UserPlus className="h-4 w-4" />
              Salvar contato
            </Button>
            <p className="text-sm text-slate-500">
              Tags e categorias ajudam na organização, mas não bloqueiam seleção manual em campanhas.
            </p>
          </div>
        </form>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="border-b border-slate-100 pb-4">
            <p className="text-sm font-semibold text-slate-950">Importação CSV</p>
            <p className="mt-1 text-sm text-slate-500">
              Cabeçalho suportado: `name;phone;tags;optIn;birthday;status`.
            </p>
          </div>
          <textarea value={csvContent} onChange={(event) => setCsvContent(event.target.value)} className="mt-4 min-h-56 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-brand-300 focus:bg-white" />
          <div className="mt-4 flex flex-wrap gap-3">
            <Button type="button" variant="secondary" className="gap-2" onClick={handleImport} disabled={pending}>
              <Upload className="h-4 w-4" />
              Importar CSV
            </Button>
            <p className="text-sm text-slate-500">
              Telefones são normalizados; registros com o mesmo número são atualizados.
            </p>
          </div>
        </section>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-950">Base de contatos</p>
            <p className="mt-1 text-sm text-slate-500">
              Busca por nome, telefone ou código. Revise telefone, opt-in e bloqueios antes de iniciar uma operação.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome, telefone ou código" />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700">
              <option value="ALL">Todos os status</option>
              <option value="ACTIVE">Ativos</option>
              <option value="UNSUBSCRIBED">Opt-out</option>
              <option value="BLOCKED">Bloqueados</option>
              <option value="INVALID">Sem telefone</option>
            </select>
            <select value={optInFilter} onChange={(event) => setOptInFilter(event.target.value)} className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700">
              <option value="ALL">Opt-in e opt-out</option>
              <option value="OPT_IN">Opt-in</option>
              <option value="OPT_OUT">Sem opt-in</option>
            </select>
            <Button type="button" variant="secondary" onClick={() => refreshContacts()} disabled={pending}>
              Atualizar
            </Button>
          </div>
        </div>

        {(feedback || error) ? (
          <div className="mt-4 grid gap-2">
            {feedback ? <p className="text-sm text-emerald-700">{feedback}</p> : null}
            {error ? <p className="text-sm text-rose-700">{error}</p> : null}
          </div>
        ) : null}

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.18em] text-slate-500">
                <th className="px-3 py-2 font-medium">Contato</th>
                <th className="px-3 py-2 font-medium">Telefone</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Opt-in</th>
                <th className="px-3 py-2 font-medium">Bairro</th>
                <th className="px-3 py-2 font-medium">Papel</th>
                <th className="px-3 py-2 font-medium">Influência</th>
                <th className="px-3 py-2 font-medium">Temperatura</th>
                <th className="px-3 py-2 font-medium">Próxima ação</th>
                <th className="px-3 py-2 font-medium">Tags</th>
                <th className="px-3 py-2 font-medium">Ação</th>
              </tr>
            </thead>
            <tbody>
              {filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={11} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                    Nenhum contato encontrado para este mandato ainda.
                  </td>
                </tr>
              ) : (
                filteredContacts.map((contact) => (
                  <tr key={contact.id} className="align-top">
                  <td className="rounded-l-2xl border-y border-l border-slate-200 bg-slate-50 px-3 py-3">
                    <p className="font-medium text-slate-950">{contact.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{contact.code} • {contact.source}</p>
                  </td>
                  <td className="border-y border-slate-200 bg-slate-50 px-3 py-3 text-slate-600">
                    {contact.phone}
                    {contact.invalidPhone ? <p className="mt-1 text-xs text-amber-700">Telefone inválido</p> : null}
                  </td>
                  <td className="border-y border-slate-200 bg-slate-50 px-3 py-3 text-slate-600">{renderStatus(contact.status)}</td>
                  <td className="border-y border-slate-200 bg-slate-50 px-3 py-3 text-slate-600">{contact.optIn ? "Ativo" : "Ausente"}</td>
                  <td className="border-y border-slate-200 bg-slate-50 px-3 py-3 text-slate-600">{contact.neighborhood || "Não informado"}</td>
                  <td className="border-y border-slate-200 bg-slate-50 px-3 py-3 text-slate-600">{renderOption(roleOptions, contact.role)}</td>
                  <td className="border-y border-slate-200 bg-slate-50 px-3 py-3 text-slate-600">{renderOption(influenceOptions, contact.influenceLevel)}</td>
                  <td className="border-y border-slate-200 bg-slate-50 px-3 py-3 text-slate-600">{renderOption(temperatureOptions, contact.politicalTemperature)}</td>
                  <td className="border-y border-slate-200 bg-slate-50 px-3 py-3 text-slate-600">{renderOption(nextActionOptions, contact.nextAction)}</td>
                  <td className="border-y border-slate-200 bg-slate-50 px-3 py-3 text-slate-600">{contact.tags.join(", ") || "—"}</td>
                  <td className="rounded-r-2xl border-y border-r border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="flex min-w-44 flex-col gap-2">
                      <Button type="button" variant="secondary" className="h-9 gap-2 px-3" onClick={() => openQualification(contact)}>
                        <Pencil className="h-4 w-4" />
                        Qualificar contato
                      </Button>
                      <Link href={`/admin/campaigns?selectedContactIds=${contact.id}`} className="text-sm font-medium text-brand-700">
                        Selecionar para campanha
                      </Link>
                    </div>
                  </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {qualifyingContact ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40">
          <form onSubmit={handleQualificationSave} className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-950">Qualificar contato</p>
                <p className="mt-1 text-sm text-slate-500">{qualifyingContact.name}</p>
              </div>
              <Button type="button" variant="ghost" className="h-10 w-10 px-0" onClick={() => setQualifyingContact(null)}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Bairro">
                  <Input value={qualificationForm.neighborhood} onChange={(event) => setQualificationForm((current) => ({ ...current, neighborhood: event.target.value }))} placeholder="Não informado" />
                </Field>
                <Field label="Zona">
                  <Input value={qualificationForm.zone} onChange={(event) => setQualificationForm((current) => ({ ...current, zone: event.target.value }))} placeholder="Não informado" />
                </Field>
                <Field label="Papel">
                  <Select value={qualificationForm.role} options={roleOptions} onChange={(value) => setQualificationForm((current) => ({ ...current, role: value }))} />
                </Field>
                <Field label="Influência">
                  <Select value={qualificationForm.influenceLevel} options={influenceOptions} onChange={(value) => setQualificationForm((current) => ({ ...current, influenceLevel: value }))} />
                </Field>
                <Field label="Área de interesse">
                  <Select value={qualificationForm.interestArea} options={interestOptions} onChange={(value) => setQualificationForm((current) => ({ ...current, interestArea: value }))} />
                </Field>
                <Field label="Temperatura">
                  <Select value={qualificationForm.politicalTemperature} options={temperatureOptions} onChange={(value) => setQualificationForm((current) => ({ ...current, politicalTemperature: value }))} />
                </Field>
                <Field label="Tipo de relacionamento">
                  <Select value={qualificationForm.relationshipType} options={relationshipOptions} onChange={(value) => setQualificationForm((current) => ({ ...current, relationshipType: value }))} />
                </Field>
                <Field label="Próxima ação">
                  <Select value={qualificationForm.nextAction} options={nextActionOptions} onChange={(value) => setQualificationForm((current) => ({ ...current, nextAction: value }))} />
                </Field>
              </div>
              <Field label="Observações">
                <textarea
                  value={qualificationForm.notes}
                  onChange={(event) => setQualificationForm((current) => ({ ...current, notes: event.target.value }))}
                  className="min-h-36 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
                  placeholder="Não informado"
                />
              </Field>
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 px-5 py-4">
              <Button type="button" variant="secondary" onClick={() => setQualifyingContact(null)} disabled={pending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                Salvar qualificação
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function renderStatus(status: ContactItem["status"]) {
  if (status === "ACTIVE") return "Ativo";
  if (status === "UNSUBSCRIBED") return "Opt-out";
  if (status === "BLOCKED") return "Bloqueado";
  return "Sem telefone";
}

function renderOption(options: readonly (readonly [string, string])[], value: string | null) {
  return options.find(([optionValue]) => optionValue === value)?.[1] ?? "Não informado";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}

function Select({
  value,
  options,
  onChange
}: {
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-12 rounded-2xl border border-line bg-white px-4 text-sm text-ink outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
    >
      <option value="">Não informado</option>
      {options.map(([optionValue, label]) => (
        <option key={optionValue} value={optionValue}>
          {label}
        </option>
      ))}
    </select>
  );
}
