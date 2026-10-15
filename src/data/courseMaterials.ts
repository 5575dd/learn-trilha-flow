export interface CourseResource {
  label: string;
  href: string;
}

export interface CourseLessonMaterials {
  unit: number;
  lesson: number;
  pages: readonly [number, number];
  resources: readonly CourseResource[];
}

export const module2PageCount = 305;
export const module2Units = [
  { unit: 1, title: "Where we live" },
  { unit: 2, title: "Jobs and routines" },
  { unit: 3, title: "Let's go shopping" },
  { unit: 4, title: "The past" },
] as const;

export const module2GeneralResources: readonly CourseResource[] = [
  { label: "Livro completo · Módulo 2", href: "https://lms-wo.com/mod/url/view.php?id=11202" },
  {
    label: "Unidades, complementos e trabalhos · Módulo 2",
    href: "https://lms-wo.com/course/view.php?id=818",
  },
];

function lessonMaterials(
  unit: number,
  lesson: number,
  pages: readonly [number, number],
  lessonId: string,
  complementIds: readonly string[],
  homeworkId: string,
): CourseLessonMaterials {
  const genially = (id: string) => `https://view.genially.com/${id}`;
  return {
    unit,
    lesson,
    pages,
    resources: [
      { label: `Aula · Lição ${lesson}`, href: genially(lessonId) },
      ...complementIds.map((id, index) => ({
        label:
          complementIds.length > 1
            ? `Complemento ${lesson} · Parte ${index + 1}`
            : `Complemento ${lesson}`,
        href: genially(id),
      })),
      { label: `Homework ${lesson}`, href: genially(homeworkId) },
    ],
  };
}

// Verified against course 818 and the complete Module 2 PDF on 2026-10-15.
export const module2Lessons: readonly CourseLessonMaterials[] = [
  lessonMaterials(
    1,
    1,
    [1, 29],
    "6633f343ebfbaa0014767348",
    ["6697c6480884a3ab0cd29cc4"],
    "69665a21147e31bfa8acc75b",
  ),
  lessonMaterials(
    1,
    2,
    [30, 58],
    "66392038b7c0cf0014ce6193",
    ["6697b5020884a3ab0cc82f0d"],
    "69665b67e42c1fdd2771ba51",
  ),
  lessonMaterials(
    1,
    3,
    [59, 78],
    "663a86888b3ea40013ec7a8b",
    ["69723926205a0a945dc29264", "6697d555353bfd636d5d8dd6"],
    "69666fcf590b45458fd5e76b",
  ),
  lessonMaterials(
    2,
    1,
    [79, 109],
    "663bd61a67732000141da8be",
    ["6697c99d0884a3ab0cd5244c"],
    "69667abba3d3e4ba03f8417d",
  ),
  lessonMaterials(
    2,
    2,
    [110, 133],
    "664213d098ee6a00156a5ec1",
    ["6698ef682c4ef2140f35f2d3"],
    "69667ac10599acea0fd573e3",
  ),
  lessonMaterials(
    2,
    3,
    [134, 151],
    "66425dd4fd285c0014aeba44",
    ["6698fc6df44799815a435283", "69724df35246b81c422c11d6"],
    "6966817b6787bfa23cfe3e14",
  ),
  lessonMaterials(
    3,
    1,
    [152, 179],
    "6643b7e5889b6f00141d3825",
    ["66982700c8257f3913774aab", "69725d2bc518998842dfab3d"],
    "69668470a3d3e4ba03feda1c",
  ),
  lessonMaterials(
    3,
    2,
    [180, 207],
    "6645105dea2afd00142e96e2",
    ["66996093ab6e805ff9c49be2"],
    "69668669147e31bfa8cc8f6a",
  ),
  lessonMaterials(
    3,
    3,
    [208, 227],
    "6647632e1a38570014eec661",
    ["669a3c75ea497c3817947831"],
    "69668aefa3d3e4ba03039b72",
  ),
  lessonMaterials(
    4,
    1,
    [228, 250],
    "664b9828a84ee90014961f23",
    ["669a41e5ea497c381795cc5f"],
    "696693d2af32e31ca639001a",
  ),
  lessonMaterials(
    4,
    2,
    [251, 282],
    "664e216f46b3ce001535c280",
    ["66996582ab6e805ff9c83335"],
    "696693da00f94f3ad5b781be",
  ),
  lessonMaterials(
    4,
    3,
    [283, 305],
    "664f8ceb413ff10014c4c1d1",
    ["697239ff5246b81c421ddc61"],
    "69669407a3d3e4ba030c6b4b",
  ),
];

export function findModule2Lesson(title: string): CourseLessonMaterials | undefined {
  const normalized = title.normalize("NFD").replace(/\p{M}/gu, "");
  const modules = [...normalized.matchAll(/\b(?:module|modulo)\s*(\d+)\b/gi)];
  if (modules.some((match) => Number(match[1]) !== 2)) return undefined;
  const matches = [
    ...normalized.matchAll(
      /\b(?:unit|unidade)\s*([1-4])\s*[-\u2013\u2014:·,/]?\s*(?:lesson|licao)\s*([1-3])\b/gi,
    ),
  ];
  if (matches.length === 0) return undefined;
  const keys = new Set(matches.map((match) => `${match[1]}:${match[2]}`));
  if (keys.size !== 1) return undefined;
  return module2Lessons.find(
    (item) => item.unit === Number(matches[0][1]) && item.lesson === Number(matches[0][2]),
  );
}
