"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Upload, UserPlus } from "lucide-react";

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

  const filteredContacts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return contacts.filter((contact) => {
      const matchesQuery =
        !query ||
        contact.name.toLowerCase().includes(query) ||
        contact.phone.includes(query.replace(/[^\d]/g, "")) ||
        contact.code.toLowerCase().includes(query);
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

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <form onSubmit={handleCreate} className="rounded-[28px] border border-white/10 bg-[#07111e] p-5">
          <div className="border-b border-white/10 pb-4">
            <p className="text-sm font-semibold text-white">Cadastro manual de contato</p>
            <p className="mt-1 text-sm text-slate-400">
              Cadastre o contato com telefone validado, opt-in visível e tags operacionais.
            </p>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nome do contato" className="border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500" />
            <Input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Telefone com DDI/DDD" className="border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500" />
            <Input value={form.tags} onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))} placeholder="Tags separadas por vírgula" className="border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500" />
            <Input type="date" value={form.birthday} onChange={(event) => setForm((current) => ({ ...current, birthday: event.target.value }))} className="border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500" />
            <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className="h-12 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white">
              <option value="ACTIVE" className="text-slate-950">Ativo</option>
              <option value="UNSUBSCRIBED" className="text-slate-950">Opt-out</option>
              <option value="BLOCKED" className="text-slate-950">Bloqueado</option>
              <option value="INVALID" className="text-slate-950">Sem telefone</option>
            </select>
            <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
              <input type="checkbox" checked={form.optIn} onChange={(event) => setForm((current) => ({ ...current, optIn: event.target.checked }))} className="h-4 w-4" />
              Opt-in ativo
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <Button type="submit" className="gap-2" disabled={pending}>
              <UserPlus className="h-4 w-4" />
              Salvar contato
            </Button>
            <p className="text-sm text-slate-400">
              Tags e categorias ajudam na organização, mas não bloqueiam seleção manual em campanhas.
            </p>
          </div>
        </form>

        <section className="rounded-[28px] border border-white/10 bg-[#07111e] p-5">
          <div className="border-b border-white/10 pb-4">
            <p className="text-sm font-semibold text-white">Importação CSV</p>
            <p className="mt-1 text-sm text-slate-400">
              Cabeçalho suportado: `name;phone;tags;optIn;birthday;status`.
            </p>
          </div>
          <textarea value={csvContent} onChange={(event) => setCsvContent(event.target.value)} className="mt-4 min-h-56 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none" />
          <div className="mt-4 flex flex-wrap gap-3">
            <Button type="button" variant="secondary" className="gap-2 border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]" onClick={handleImport} disabled={pending}>
              <Upload className="h-4 w-4" />
              Importar CSV
            </Button>
            <p className="text-sm text-slate-400">
              Telefones são normalizados; registros com o mesmo número são atualizados.
            </p>
          </div>
        </section>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-[#07111e] p-5">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Base de contatos</p>
            <p className="mt-1 text-sm text-slate-400">
              Busca por nome, telefone ou código. Revise telefone, opt-in e bloqueios antes de iniciar uma operação.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome, telefone ou código" className="border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500" />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-12 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white">
              <option value="ALL" className="text-slate-950">Todos os status</option>
              <option value="ACTIVE" className="text-slate-950">Ativos</option>
              <option value="UNSUBSCRIBED" className="text-slate-950">Opt-out</option>
              <option value="BLOCKED" className="text-slate-950">Bloqueados</option>
              <option value="INVALID" className="text-slate-950">Sem telefone</option>
            </select>
            <select value={optInFilter} onChange={(event) => setOptInFilter(event.target.value)} className="h-12 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white">
              <option value="ALL" className="text-slate-950">Opt-in e opt-out</option>
              <option value="OPT_IN" className="text-slate-950">Opt-in</option>
              <option value="OPT_OUT" className="text-slate-950">Sem opt-in</option>
            </select>
            <Button type="button" variant="secondary" className="border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]" onClick={() => refreshContacts()} disabled={pending}>
              Atualizar
            </Button>
          </div>
        </div>

        {(feedback || error) ? (
          <div className="mt-4 grid gap-2">
            {feedback ? <p className="text-sm text-emerald-300">{feedback}</p> : null}
            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
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
                <th className="px-3 py-2 font-medium">Tags</th>
                <th className="px-3 py-2 font-medium">Ação</th>
              </tr>
            </thead>
            <tbody>
              {filteredContacts.map((contact) => (
                <tr key={contact.id} className="align-top">
                  <td className="rounded-l-2xl border-y border-l border-white/8 bg-white/[0.03] px-3 py-3">
                    <p className="font-medium text-white">{contact.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{contact.code} • {contact.source}</p>
                  </td>
                  <td className="border-y border-white/8 bg-white/[0.03] px-3 py-3 text-slate-300">
                    {contact.phone}
                    {contact.invalidPhone ? <p className="mt-1 text-xs text-amber-300">Telefone inválido</p> : null}
                  </td>
                  <td className="border-y border-white/8 bg-white/[0.03] px-3 py-3 text-slate-300">{renderStatus(contact.status)}</td>
                  <td className="border-y border-white/8 bg-white/[0.03] px-3 py-3 text-slate-300">{contact.optIn ? "Ativo" : "Ausente"}</td>
                  <td className="border-y border-white/8 bg-white/[0.03] px-3 py-3 text-slate-300">{contact.tags.join(", ") || "—"}</td>
                  <td className="rounded-r-2xl border-y border-r border-white/8 bg-white/[0.03] px-3 py-3">
                    <Link href={`/admin/campaigns?selectedContactIds=${contact.id}`} className="text-sm font-medium text-cyan-300">
                      Selecionar para campanha
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function renderStatus(status: ContactItem["status"]) {
  if (status === "ACTIVE") return "Ativo";
  if (status === "UNSUBSCRIBED") return "Opt-out";
  if (status === "BLOCKED") return "Bloqueado";
  return "Sem telefone";
}
