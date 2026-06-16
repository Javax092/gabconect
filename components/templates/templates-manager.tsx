"use client";

import { useMemo, useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";

import { CopyButton } from "@/components/admin/copy-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage } from "@/lib/utils";

type TemplateItem = {
  id: string;
  name: string;
  category: string;
  language: string;
  templateId: string;
  content: string;
  approved: boolean;
  updatedAt: string;
};

type TemplatesManagerProps = {
  initialTemplates: TemplateItem[];
};

const emptyForm = {
  name: "",
  category: "",
  language: "pt_BR",
  templateId: "",
  content: "",
  approved: false
};

export function TemplatesManager({ initialTemplates }: TemplatesManagerProps) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [languageFilter, setLanguageFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredTemplates = useMemo(
    () =>
      templates.filter((template) => {
        const categoryOk = categoryFilter
          ? template.category.toLowerCase().includes(categoryFilter.toLowerCase())
          : true;
        const languageOk = languageFilter
          ? template.language.toLowerCase().includes(languageFilter.toLowerCase())
          : true;

        return categoryOk && languageOk;
      }),
    [categoryFilter, languageFilter, templates]
  );

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  function startEdit(template: TemplateItem) {
    setEditingId(template.id);
    setForm({
      name: template.name,
      category: template.category,
      language: template.language,
      templateId: template.templateId,
      content: template.content,
      approved: template.approved
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFeedback(null);

    try {
      const response = await fetch(editingId ? `/api/templates/${editingId}` : "/api/templates", {
        method: editingId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(form)
      });

      const data = (await response.json()) as {
        template?: TemplateItem;
        message?: string;
      };

      if (!response.ok || !data.template) {
        setError(getApiErrorMessage(data, "Não foi possível salvar o template."));
        return;
      }

      if (editingId) {
        setTemplates((current) => current.map((item) => (item.id === data.template?.id ? data.template : item)));
      } else {
        setTemplates((current) => [data.template as TemplateItem, ...current]);
      }

      setFeedback(data.message ?? "Template salvo.");
      resetForm();
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(templateId: string) {
    setPending(true);
    setError(null);
    setFeedback(null);

    try {
      const response = await fetch(`/api/templates/${templateId}`, {
        method: "DELETE"
      });
      const data = (await response.json()) as unknown;

      if (!response.ok) {
        setError(getApiErrorMessage(data, "Não foi possível remover o template."));
        return;
      }

      setTemplates((current) => current.filter((item) => item.id !== templateId));
      setFeedback("Template removido.");
      if (editingId === templateId) {
        resetForm();
      }
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nome do template" />
            <Input value={form.templateId} onChange={(event) => setForm((current) => ({ ...current, templateId: event.target.value }))} placeholder="template_id_meta" />
            <Input value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} placeholder="Categoria" />
            <Input value={form.language} onChange={(event) => setForm((current) => ({ ...current, language: event.target.value }))} placeholder="Idioma" />
          </div>

          <textarea
            value={form.content}
            onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
            rows={5}
            className="flex w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-brand-300 focus:bg-white"
            placeholder="Conteúdo aprovado pela Meta"
          />

          <label className="flex items-center gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.approved}
              onChange={(event) => setForm((current) => ({ ...current, approved: event.target.checked }))}
            />
            Template aprovado para uso seguro
          </label>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" className="gap-2" disabled={pending}>
              {editingId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingId ? "Salvar alterações" : "Criar template"}
            </Button>
            {editingId ? (
              <Button type="button" variant="secondary" onClick={resetForm}>
                Cancelar edição
              </Button>
            ) : null}
          </div>
        </form>

        {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}
        {feedback ? <p className="mt-4 text-sm text-emerald-700">{feedback}</p> : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Input value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} placeholder="Filtrar por categoria" />
        <Input value={languageFilter} onChange={(event) => setLanguageFilter(event.target.value)} placeholder="Filtrar por idioma" />
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        {filteredTemplates.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-600 xl:col-span-2">
            Nenhum template encontrado para os filtros selecionados.
          </div>
        ) : (
          filteredTemplates.map((template) => (
          <article key={template.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-slate-950">{template.name}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {template.category} • {template.language}
                </p>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  template.approved
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
              >
                {template.approved ? "Aprovado" : "Pendente"}
              </span>
            </div>

            <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
              {template.content}
            </p>

            <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
              <span>Template ID: {template.templateId}</span>
              <span>
                Atualizado: {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(template.updatedAt))}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <Button type="button" variant="secondary" className="gap-2" onClick={() => startEdit(template)}>
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
              <CopyButton value={template.content} label="Copiar conteúdo" />
              <Button type="button" variant="danger" className="gap-2" onClick={() => handleDelete(template.id)}>
                <Trash2 className="h-4 w-4" />
                Excluir
              </Button>
            </div>
          </article>
          ))
        )}
      </div>
    </div>
  );
}
