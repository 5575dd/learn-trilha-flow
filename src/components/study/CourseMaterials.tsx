import { BookOpen, ExternalLink, FileText } from "lucide-react";

const resources = [
  { label: "Livro completo · Módulo 2", href: "https://lms-wo.com/mod/url/view.php?id=11202" },
  {
    label: "Unidades, complementos e trabalhos · Módulo 2",
    href: "https://lms-wo.com/course/view.php?id=818",
  },
];
const lesson2 = [
  { label: "Aula · Jobs and routines", href: "https://view.genially.com/664213d098ee6a00156a5ec1" },
  { label: "Complementary Material 2", href: "https://view.genially.com/6698ef682c4ef2140f35f2d3" },
  { label: "Homework 2", href: "https://view.genially.com/69667ac10599acea0fd573e3" },
];

export function CourseMaterials({ showLesson2 = false }: { showLesson2?: boolean }) {
  return (
    <section className="space-y-3 border-t border-border py-4">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <BookOpen className="size-4" aria-hidden />
        Material oficial do curso
      </h2>
      <ul className="divide-y divide-border">
        {resources.map((item) => (
          <ResourceLink key={item.href} {...item} />
        ))}
      </ul>
      {showLesson2 && (
        <>
          <h3 className="text-sm font-semibold text-muted-foreground">Unidade 2 · Lição 2</h3>
          <ul className="divide-y divide-border">
            {lesson2.map((item) => (
              <ResourceLink key={item.href} {...item} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function ResourceLink({ label, href }: { label: string; href: string }) {
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
