"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { LoaderCircle, Pencil, Plus, Save, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage } from "@/lib/utils";
import type { CategoryFormValues } from "@/lib/validations/category";

type CategoryItem = {
  id: string;
  name: string;
  color: string;
  demandsCount: number;
  createdAt: string;
};

type FeedbackState =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

type CategoriesManagerProps = {
  initialCategories: CategoryItem[];
  mandateName: string;
};

const emptyForm: CategoryFormValues = {
  name: "",
  color: "#64748b"
};

export function CategoriesManager({
  initialCategories,
  mandateName
}: CategoriesManagerProps) {
  const [categories, setCategories] = useState(initialCategories);
  const [createForm, setCreateForm] = useState<CategoryFormValues>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CategoryFormValues>(emptyForm);
  const [createPending, setCreatePending] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  const totals = useMemo(() => {
    const usedCategories = categories.filter((category) => category.demandsCount > 0).length;

    return {
      totalCategories: categories.length,
      usedCategories
    };
  }, [categories]);

  function resetCreateForm() {
    setCreateForm(emptyForm);
  }

  function startEditing(category: CategoryItem) {
    setEditingId(category.id);
    setEditForm({
      name: category.name,
      color: category.color
    });
    setFeedback(null);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditForm(emptyForm);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatePending(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(createForm)
      });

      const data = (await response.json()) as { message?: string; category?: CategoryItem };

      if (!response.ok || !data.category) {
        setFeedback({
          type: "error",
          message: getApiErrorMessage(data, "Não foi possível criar a categoria.")
        });
        return;
      }

      const createdCategory = data.category;

      setCategories((current) =>
        [...current, createdCategory].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      );
      resetCreateForm();
      setFeedback({
        type: "success",
        message: data.message ?? "Categoria criada com sucesso."
      });
    } catch {
      setFeedback({
        type: "error",
        message: "Falha de conexão. Tente novamente."
      });
    } finally {
      setCreatePending(false);
    }
  }

  async function handleUpdate(categoryId: string) {
    setActionId(categoryId);
    setFeedback(null);

    try {
      const response = await fetch(`/api/categories/${categoryId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(editForm)
      });

      const data = (await response.json()) as { message?: string; category?: CategoryItem };

      if (!response.ok || !data.category) {
        setFeedback({
          type: "error",
          message: getApiErrorMessage(data, "Não foi possível atualizar a categoria.")
        });
        return;
      }

      const updatedCategory = data.category;

      setCategories((current) =>
        current
          .map((category) => (category.id === categoryId ? updatedCategory : category))
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      );
      cancelEditing();
      setFeedback({
        type: "success",
        message: data.message ?? "Categoria atualizada com sucesso."
      });
    } catch {
      setFeedback({
        type: "error",
        message: "Falha de conexão. Tente novamente."
      });
    } finally {
      setActionId(null);
    }
  }

  async function handleDelete(category: CategoryItem) {
    const confirmed = window.confirm(
      `Excluir a categoria "${category.name}" do mandato ${mandateName}?`
    );

    if (!confirmed) {
      return;
    }

    setActionId(category.id);
    setFeedback(null);

    try {
      const response = await fetch(`/api/categories/${category.id}`, {
        method: "DELETE"
      });

      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        setFeedback({
          type: "error",
          message: getApiErrorMessage(data, "Não foi possível excluir a categoria.")
        });
        return;
      }

      setCategories((current) => current.filter((item) => item.id !== category.id));
      if (editingId === category.id) {
        cancelEditing();
      }
      setFeedback({
        type: "success",
        message: data.message ?? "Categoria excluída com sucesso."
      });
    } catch {
      setFeedback({
        type: "error",
        message: "Falha de conexão. Tente novamente."
      });
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-soft lg:p-8">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-700">
              Categorias
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-ink">Organização operacional das demandas</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
              Cada mandato mantém sua própria taxonomia. As categorias só podem ser excluídas
              quando não estiverem vinculadas a nenhuma demanda.
            </p>
          </div>

          <div className="rounded-3xl border border-brand-100 bg-brand-50 px-5 py-4 text-sm text-brand-800">
            {totals.totalCategories} categorias, {totals.usedCategories} em uso.
          </div>
        </div>

        {feedback ? (
          <div
            className={`mt-6 rounded-2xl border px-4 py-3 text-sm ${
              feedback.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {feedback.message}
          </div>
        ) : null}

        <div className="mt-8 space-y-4">
          {categories.map((category) => {
            const isEditing = editingId === category.id;
            const isBusy = actionId === category.id;

            return (
              <article
                key={category.id}
                className="rounded-[28px] border border-slate-200 bg-slate-50 p-5"
              >
                {isEditing ? (
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_140px_auto]">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Nome</label>
                      <Input
                        value={editForm.name}
                        onChange={(event) =>
                          setEditForm((current) => ({ ...current, name: event.target.value }))
                        }
                        placeholder="Ex.: Saúde"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Cor</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={editForm.color}
                          onChange={(event) =>
                            setEditForm((current) => ({ ...current, color: event.target.value }))
                          }
                          className="h-12 w-14 rounded-2xl border border-line bg-white p-1"
                        />
                        <Input
                          value={editForm.color}
                          onChange={(event) =>
                            setEditForm((current) => ({ ...current, color: event.target.value }))
                          }
                          placeholder="#2563eb"
                        />
                      </div>
                    </div>

                    <div className="flex items-end gap-2">
                      <Button
                        className="gap-2"
                        disabled={isBusy}
                        onClick={() => void handleUpdate(category.id)}
                      >
                        {isBusy ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        Salvar
                      </Button>
                      <Button variant="secondary" disabled={isBusy} onClick={cancelEditing}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <span
                          className="h-4 w-4 rounded-full border border-white shadow-sm"
                          style={{ backgroundColor: category.color }}
                        />
                        <h2 className="text-lg font-semibold text-ink">{category.name}</h2>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                          {category.demandsCount}{" "}
                          {category.demandsCount === 1 ? "demanda" : "demandas"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">{category.color}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        className="gap-2"
                        onClick={() => startEditing(category)}
                        disabled={isBusy}
                      >
                        <Pencil className="h-4 w-4" />
                        Editar
                      </Button>
                      <Button
                        variant="secondary"
                        className="gap-2 text-rose-700"
                        onClick={() => void handleDelete(category)}
                        disabled={isBusy || category.demandsCount > 0}
                        title={
                          category.demandsCount > 0
                            ? "A categoria está em uso e não pode ser excluída."
                            : "Excluir categoria"
                        }
                      >
                        {isBusy ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        Excluir
                      </Button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <aside className="space-y-6">
        <form
          onSubmit={(event) => void handleCreate(event)}
          className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-soft"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-brand-600 p-3 text-white">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-ink">Nova categoria</h2>
              <p className="mt-1 text-sm text-slate-500">
                Crie uma classificação exclusiva para este mandato.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-5">
            <div className="space-y-2">
              <label htmlFor="create-name" className="text-sm font-medium text-slate-700">
                Nome
              </label>
              <Input
                id="create-name"
                value={createForm.name}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Ex.: Iluminação pública"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="create-color" className="text-sm font-medium text-slate-700">
                Cor
              </label>
              <div className="flex gap-2">
                <input
                  id="create-color"
                  type="color"
                  value={createForm.color}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, color: event.target.value }))
                  }
                  className="h-12 w-14 rounded-2xl border border-line bg-white p-1"
                />
                <Input
                  value={createForm.color}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, color: event.target.value }))
                  }
                  placeholder="#64748b"
                  required
                />
              </div>
            </div>
          </div>

          <Button type="submit" className="mt-6 w-full gap-2" disabled={createPending}>
            {createPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {createPending ? "Criando..." : "Criar categoria"}
          </Button>
        </form>

        <section className="rounded-[32px] border border-slate-200 bg-slate-50 p-6">
          <h2 className="text-lg font-semibold text-ink">Regras do módulo</h2>
          <div className="mt-4 space-y-4 text-sm leading-7 text-slate-600">
            <p>As categorias são sempre filtradas pelo mandato autenticado.</p>
            <p>Demandas existentes preservam a integridade e bloqueiam exclusão da categoria em uso.</p>
            <p>As sugestões iniciais são provisionadas automaticamente para novos mandatos.</p>
          </div>
        </section>
      </aside>
    </div>
  );
}
