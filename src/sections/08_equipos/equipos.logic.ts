export interface BaseTeam {
  id: string;
  name: string;
  shortCode: string;
  group: string;
  confederation: string;
  flag?: string;
  crest?: string;
  crestThumb?: string;
  coverImage?: string;
  coverImageThumb?: string;
}

export interface EspecialBlock {
  tipo?: string;
  fortaleza?: string;
  riesgo?: string;
  jugadores_clave_mencionados?: string[];
  tags?: string[];
  tono_visual?: string;
  uso_recomendado?: string[];
}

export interface EquipoInfo {
  id: string;
  seleccion: string;
  confederacion: string;
  categoria_fuente?: string;
  formaciones?: string[];
  titulo?: string;
  informacion_secundaria?: string;
  informacion_terciaria?: string;
  especial?: EspecialBlock;
}

export interface EquipoBundle {
  schema_version?: string;
  nombre_dataset?: string;
  equipos: EquipoInfo[];
}

export interface EnrichedTeam extends BaseTeam {
  info?: EquipoInfo;
}

export interface GroupBucket {
  id: string;
  label: string;
  teams: EnrichedTeam[];
}

// Nombres en teams.json que difieren del campo `seleccion` en el editorial.
const NAME_ALIAS: Record<string, string> = {
  "Türkiye": "Turquía",
};

export function buildInfoIndex(bundle: EquipoBundle): Map<string, EquipoInfo> {
  return new Map(bundle.equipos.map((entry) => [entry.seleccion, entry]));
}

export function enrichTeams(teams: BaseTeam[], index: Map<string, EquipoInfo>): EnrichedTeam[] {
  return teams.map((team) => {
    const lookupKey = NAME_ALIAS[team.name] ?? team.name;
    return { ...team, info: index.get(lookupKey) };
  });
}

export function groupByGroupId(teams: EnrichedTeam[]): GroupBucket[] {
  const buckets = new Map<string, EnrichedTeam[]>();
  for (const team of teams) {
    if (!buckets.has(team.group)) buckets.set(team.group, []);
    buckets.get(team.group)!.push(team);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, list]) => ({ id, label: `Grupo ${id}`, teams: list }));
}

const CONFEDERATION_ORDER = ["UEFA", "CONMEBOL", "CONCACAF", "CAF", "AFC", "OFC"];

export function uniqueConfederations(teams: BaseTeam[]): string[] {
  const present = new Set(teams.map((t) => t.confederation));
  return CONFEDERATION_ORDER.filter((conf) => present.has(conf));
}

export function shortDescription(info?: EquipoInfo, fallback = "Ficha editorial pendiente."): string {
  if (!info) return fallback;
  return info.titulo ?? info.informacion_secundaria ?? fallback;
}
