-- FEBAD — esquema Supabase (plan free)
-- Pegar todo este archivo en el SQL Editor de tu proyecto Supabase y correrlo (Run).

create table if not exists eventos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  modalidad text not null check (modalidad in ('circuito', 'rally')),
  sede text not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  estatus text not null check (estatus in ('nacional', 'internacional')),
  created_at timestamptz not null default now()
);

create table if not exists noticias (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  resumen text not null,
  url_origen text,
  publicado_en timestamptz not null default now()
);

create table if not exists directorio (
  id uuid primary key default gen_random_uuid(),
  cargo text not null,
  nombre text not null,
  atribuciones text not null,
  orden int not null default 0
);

create table if not exists asociaciones (
  id uuid primary key default gen_random_uuid(),
  sigla text not null,
  nombre text not null,
  departamento text not null,
  contacto text,
  facebook_url text
);

create table if not exists solicitudes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('licencia', 'acreditacion_medios', 'consulta')),
  nombre_completo text not null,
  email text not null,
  mensaje text not null,
  creado_en timestamptz not null default now()
);

-- Row Level Security
alter table eventos enable row level security;
alter table noticias enable row level security;
alter table directorio enable row level security;
alter table asociaciones enable row level security;
alter table solicitudes enable row level security;

-- Lectura pública en las cuatro tablas de contenido
create policy "eventos_public_read" on eventos for select using (true);
create policy "noticias_public_read" on noticias for select using (true);
create policy "directorio_public_read" on directorio for select using (true);
create policy "asociaciones_public_read" on asociaciones for select using (true);

-- solicitudes: solo insert público, nunca select (evita exponer datos de contacto)
create policy "solicitudes_public_insert" on solicitudes for insert with check (true);
