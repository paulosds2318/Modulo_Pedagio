"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type ConfirmOptions = {
  titulo: string;
  mensagem?: string;
  /** Linhas "rótulo: valor" com os dados da ação (lote, valor, passagens…). */
  itens?: { rotulo: string; valor: string }[];
  /** Destaque de atenção dentro do card (ex.: valor diferente do devido). */
  aviso?: string;
  confirmarTexto?: string;
  cancelarTexto?: string;
  /** "perigo" para ações que não se desfazem (cancelar, excluir): botão vermelho e foco em Cancelar. */
  tom?: "padrao" | "perigo";
  /** Só o botão de confirmar (usado como aviso). */
  semCancelar?: boolean;
};

type Pedido = ConfirmOptions & { resolver: (ok: boolean) => void };
type Confirmar = (opcoes: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirmar | null>(null);

/** Pede confirmação com um card do sistema, no lugar da caixa do navegador. Resolve true ao confirmar. */
export function useConfirm(): Confirmar {
  const confirmar = useContext(ConfirmContext);
  if (!confirmar) throw new Error("useConfirm precisa estar dentro de <ConfirmProvider>.");
  return confirmar;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const pedidoRef = useRef<Pedido | null>(null);
  const botaoConfirmar = useRef<HTMLButtonElement>(null);
  const botaoCancelar = useRef<HTMLButtonElement>(null);
  const focoAnterior = useRef<HTMLElement | null>(null);

  const fechar = useCallback((ok: boolean) => {
    const atual = pedidoRef.current;
    pedidoRef.current = null;
    setPedido(null);
    atual?.resolver(ok);
    focoAnterior.current?.focus?.();
  }, []);

  const confirmar = useCallback<Confirmar>((opcoes) => {
    return new Promise<boolean>((resolver) => {
      // Se já havia um card aberto, ele é cancelado: nunca ficam dois ao mesmo tempo.
      pedidoRef.current?.resolver(false);
      focoAnterior.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const novo = { ...opcoes, resolver };
      pedidoRef.current = novo;
      setPedido(novo);
    });
  }, []);

  useEffect(() => {
    if (!pedido) return;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Ações que não se desfazem começam com o foco em Cancelar, para um Enter sem querer não confirmar.
    (pedido.tom === "perigo" && botaoCancelar.current ? botaoCancelar.current : botaoConfirmar.current)?.focus();

    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        evento.preventDefault();
        fechar(false);
        return;
      }
      if (evento.key !== "Tab") return;
      const botoes = [botaoCancelar.current, botaoConfirmar.current].filter((b): b is HTMLButtonElement => Boolean(b));
      if (!botoes.length) return;
      const indice = botoes.indexOf(document.activeElement as HTMLButtonElement);
      const proximo = evento.shiftKey ? (indice <= 0 ? botoes.length - 1 : indice - 1) : indice === botoes.length - 1 ? 0 : indice + 1;
      evento.preventDefault();
      botoes[proximo].focus();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAnterior;
    };
  }, [pedido, fechar]);

  const perigo = pedido?.tom === "perigo";

  return (
    <ConfirmContext.Provider value={confirmar}>
      {children}
      {pedido && (
        <div
          className="confirm-overlay"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget && !pedido.semCancelar) fechar(false);
          }}
        >
          <div className={`confirm-card${perigo ? " confirm-card-perigo" : ""}`} role="alertdialog" aria-modal="true" aria-labelledby="confirm-titulo" aria-describedby={pedido.mensagem ? "confirm-mensagem" : undefined}>
            <div className="confirm-icone" aria-hidden="true">
              {perigo ? "!" : "?"}
            </div>
            <h2 id="confirm-titulo" className="confirm-titulo">
              {pedido.titulo}
            </h2>
            {pedido.mensagem && (
              <p id="confirm-mensagem" className="confirm-mensagem">
                {pedido.mensagem}
              </p>
            )}
            {pedido.itens && pedido.itens.length > 0 && (
              <dl className="confirm-itens">
                {pedido.itens.map((item) => (
                  <div key={item.rotulo}>
                    <dt>{item.rotulo}</dt>
                    <dd>{item.valor}</dd>
                  </div>
                ))}
              </dl>
            )}
            {pedido.aviso && <div className="confirm-aviso">{pedido.aviso}</div>}
            <div className="confirm-acoes">
              {!pedido.semCancelar && (
                <button type="button" ref={botaoCancelar} className="button secondary" onClick={() => fechar(false)}>
                  {pedido.cancelarTexto ?? "Cancelar"}
                </button>
              )}
              <button type="button" ref={botaoConfirmar} className={`button ${perigo ? "danger" : "primary"}`} onClick={() => fechar(true)}>
                {pedido.confirmarTexto ?? (pedido.semCancelar ? "Entendi" : "Confirmar")}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
