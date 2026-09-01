"use client";

import { CircleQuestionMark, X } from "lucide-react";
import { useId, useState } from "react";

export type HowTo = {
  /** What the feature is for, in one or two sentences. */
  purpose: string[];
  /** The happy path, as steps the user can follow in order. */
  steps: string[];
  /** The things that surprise people the first time. */
  notes?: string[];
};

/**
 * Contextual help that stays available forever, not only while a list is empty.
 * Collapsed by default so it costs no space, and written as “what can I do /
 * how do I do it / what should I watch out for”.
 */
export function HowToUse({ how, title }: { how: HowTo; title: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <>
      <button
        aria-controls={id}
        aria-expanded={open}
        className="howto-toggle"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <CircleQuestionMark aria-hidden="true" size={15} />
        如何使用？
      </button>
      {open ? (
        <section aria-label={`${title}使用說明`} className="howto" id={id}>
          <div className="howto-head">
            <h3>{title}怎麼用</h3>
            <button aria-label="關閉使用說明" className="howto-close" onClick={() => setOpen(false)} type="button">
              <X aria-hidden="true" size={15} />
            </button>
          </div>
          <div className="howto-body">
            <div className="howto-block">
              <h4>可以做什麼</h4>
              {how.purpose.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            <div className="howto-block">
              <h4>操作流程</h4>
              <ol>
                {how.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
            {how.notes?.length ? (
              <div className="howto-block">
                <h4>注意事項</h4>
                <ul>
                  {how.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </>
  );
}
