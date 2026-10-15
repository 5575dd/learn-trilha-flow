import { useId, useState } from "react";
import { BookOpen, ExternalLink, FileText } from "lucide-react";
import {
  findModule2Lesson,
  module2GeneralResources,
  module2Lessons,
  module2PageCount,
  module2Units,
  type CourseLessonMaterials,
  type CourseResource,
} from "@/data/courseMaterials";

export function CourseMaterials({ lessonTitle = "" }: { lessonTitle?: string }) {
  return (
    <section className="space-y-3 border-t border-border py-4">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <BookOpen className="size-4" aria-hidden />
        Material oficial do curso
      </h2>
      <ul className="divide-y divide-border">
        {module2GeneralResources.map((item) => (
          <ResourceLink key={item.href} {...item} />
        ))}
      </ul>
      <LessonMaterialsPicker key={lessonTitle} suggested={findModule2Lesson(lessonTitle)} />
    </section>
  );
}

function LessonMaterialsPicker({ suggested }: { suggested?: CourseLessonMaterials }) {
  const id = useId();
  const [unit, setUnit] = useState(suggested ? String(suggested.unit) : "");
  const [lesson, setLesson] = useState(suggested ? String(suggested.lesson) : "");
  const selected = module2Lessons.find(
    (item) => String(item.unit) === unit && String(item.lesson) === lesson,
  );
  const selectClass =
    "mt-1 min-h-12 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm";

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label htmlFor={`${id}-unit`} className="min-w-0 text-sm font-medium">
          Unidade do material · Módulo 2
          <select
            id={`${id}-unit`}
            value={unit}
            className={selectClass}
            onChange={(event) => {
              setUnit(event.target.value);
              setLesson("");
            }}
          >
            <option value="">Selecionar unidade</option>
            {module2Units.map((item) => (
              <option key={item.unit} value={item.unit}>
                Unidade {item.unit} · {item.title}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={`${id}-lesson`} className="min-w-0 text-sm font-medium">
          Lição do material
          <select
            id={`${id}-lesson`}
            value={lesson}
            disabled={!unit}
            className={`${selectClass} disabled:opacity-50`}
            onChange={(event) => setLesson(event.target.value)}
          >
            <option value="">Selecionar lição</option>
            {module2Lessons
              .filter((item) => String(item.unit) === unit)
              .map((item) => (
                <option key={item.lesson} value={item.lesson}>
                  Lição {item.lesson}
                </option>
              ))}
          </select>
        </label>
      </div>
      <div aria-live="polite">
        {selected && (
          <>
            <h3 className="text-sm font-semibold text-muted-foreground">
              Unidade {selected.unit} · Lição {selected.lesson}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Livro: páginas {selected.pages[0]}–{selected.pages[1]} de {module2PageCount}
            </p>
            <ul className="mt-2 divide-y divide-border">
              {selected.resources.map((item) => (
                <ResourceLink key={item.href} {...item} />
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}

function ResourceLink({ label, href }: CourseResource) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-12 items-center gap-3 py-3 text-sm font-medium text-primary"
      >
        <FileText className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 break-words">{label}</span>
        <ExternalLink className="size-4 shrink-0" aria-hidden />
      </a>
    </li>
  );
}
