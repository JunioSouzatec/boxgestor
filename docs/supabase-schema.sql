-- =============================================================================
-- Craft Oficina — Schema Supabase
-- Multi-oficina (SaaS) · PostgreSQL
-- Execute no SQL Editor do Supabase ou via CLI: supabase db push
-- =============================================================================

-- Extensões
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- Tipos enumerados (espelham src/types/enums.ts)
-- =============================================================================

CREATE TYPE public.status_os AS ENUM (
  'recebida',
  'em_diagnostico',
  'aguardando_aprovacao',
  'aguardando_peca',
  'em_servico',
  'finalizada',
  'entregue',
  'cancelada'
);

CREATE TYPE public.status_agendamento AS ENUM (
  'agendado',
  'confirmado',
  'em_atendimento',
  'concluido',
  'cancelado'
);

CREATE TYPE public.status_orcamento AS ENUM (
  'aguardando_aprovacao',
  'aprovado',
  'reprovado',
  'rascunho',
  'enviado',
  'recusado',
  'convertido'
);

CREATE TYPE public.tipo_lancamento AS ENUM ('receita', 'despesa');

CREATE TYPE public.forma_pagamento AS ENUM (
  'pix',
  'dinheiro',
  'debito',
  'credito',
  'credito_parcelado',
  'fiado'
);

CREATE TYPE public.profile_role AS ENUM (
  'owner',
  'admin',
  'mecanico',
  'recepcionista'
);

-- =============================================================================
-- Função: atualizar updated_at automaticamente
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- OFFICES — tenant raiz (oficinas)
-- =============================================================================

CREATE TABLE public.offices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  address       TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  cnpj          TEXT,
  email         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_offices_updated_at
  BEFORE UPDATE ON public.offices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- PROFILES — usuários vinculados ao auth.users (login futuro)
-- =============================================================================

CREATE TABLE public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  office_id     UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL DEFAULT '',
  role          public.profile_role NOT NULL DEFAULT 'recepcionista',
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_office_id ON public.profiles(office_id);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- SETTINGS — preferências por oficina
-- =============================================================================

CREATE TABLE public.settings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id               UUID NOT NULL UNIQUE REFERENCES public.offices(id) ON DELETE CASCADE,
  dark_theme              BOOLEAN NOT NULL DEFAULT TRUE,
  notifications           BOOLEAN NOT NULL DEFAULT TRUE,
  low_stock_alert         BOOLEAN NOT NULL DEFAULT TRUE,
  next_service_order_num  INTEGER NOT NULL DEFAULT 1001,
  metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_settings_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- CUSTOMERS — clientes
-- =============================================================================

CREATE TABLE public.customers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id     UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL DEFAULT '',
  cpf           TEXT,
  address       TEXT NOT NULL DEFAULT '',
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_office_id ON public.customers(office_id);
CREATE INDEX idx_customers_office_name ON public.customers(office_id, name);

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- MOTORCYCLES — motos
-- =============================================================================

CREATE TABLE public.motorcycles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id       UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  brand           TEXT NOT NULL,
  model           TEXT NOT NULL,
  year            INTEGER NOT NULL CHECK (year >= 1900 AND year <= 2100),
  plate           TEXT NOT NULL,
  color           TEXT NOT NULL DEFAULT '',
  mileage         INTEGER NOT NULL DEFAULT 0 CHECK (mileage >= 0),
  chassis         TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (office_id, plate)
);

CREATE INDEX idx_motorcycles_office_id ON public.motorcycles(office_id);
CREATE INDEX idx_motorcycles_customer_id ON public.motorcycles(customer_id);

CREATE TRIGGER trg_motorcycles_updated_at
  BEFORE UPDATE ON public.motorcycles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- INVENTORY_ITEMS — estoque / peças
-- =============================================================================

CREATE TABLE public.inventory_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id       UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  code            TEXT NOT NULL,
  brand           TEXT NOT NULL DEFAULT '',
  cost            NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  sale_price      NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
  quantity        INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  minimum_stock   INTEGER NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (office_id, code)
);

CREATE INDEX idx_inventory_items_office_id ON public.inventory_items(office_id);

CREATE TRIGGER trg_inventory_items_updated_at
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- SERVICE_ORDERS — ordens de serviço
-- =============================================================================

CREATE TABLE public.service_orders (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id                 UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  customer_id               UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  motorcycle_id             UUID NOT NULL REFERENCES public.motorcycles(id) ON DELETE RESTRICT,
  number                    INTEGER NOT NULL,
  reported_issue            TEXT NOT NULL,
  diagnosis                 TEXT NOT NULL DEFAULT '',
  services_performed        TEXT NOT NULL DEFAULT '',
  parts_used                JSONB NOT NULL DEFAULT '[]'::jsonb,
  parts_value               NUMERIC(12, 2) NOT NULL DEFAULT 0,
  labor_value               NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount                  NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_value               NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status                    public.status_os NOT NULL DEFAULT 'recebida',
  entry_checklist           JSONB,
  estimated_value           NUMERIC(12, 2),
  budget_date               DATE,
  budget_status             public.status_orcamento,
  entry_mileage             INTEGER CHECK (entry_mileage >= 0),
  exit_mileage              INTEGER CHECK (exit_mileage >= 0),
  warranty_days             INTEGER CHECK (warranty_days >= 0),
  warranty_expires_at       DATE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (office_id, number)
);

CREATE INDEX idx_service_orders_office_id ON public.service_orders(office_id);
CREATE INDEX idx_service_orders_office_status ON public.service_orders(office_id, status);
CREATE INDEX idx_service_orders_motorcycle_id ON public.service_orders(motorcycle_id);
CREATE INDEX idx_service_orders_customer_id ON public.service_orders(customer_id);

CREATE TRIGGER trg_service_orders_updated_at
  BEFORE UPDATE ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- SERVICE_ORDER_PHOTOS — fotos da OS (entrada, avarias, conclusão)
-- =============================================================================

CREATE TABLE public.service_order_photos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id         UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  service_order_id  UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  storage_path      TEXT NOT NULL,
  public_url        TEXT,
  caption           TEXT,
  photo_type        TEXT NOT NULL DEFAULT 'geral',
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_service_order_photos_order ON public.service_order_photos(service_order_id);
CREATE INDEX idx_service_order_photos_office ON public.service_order_photos(office_id);

CREATE TRIGGER trg_service_order_photos_updated_at
  BEFORE UPDATE ON public.service_order_photos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- APPOINTMENTS — agenda
-- =============================================================================

CREATE TABLE public.appointments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id         UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  customer_id       UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  motorcycle_id     UUID NOT NULL REFERENCES public.motorcycles(id) ON DELETE RESTRICT,
  service_order_id  UUID REFERENCES public.service_orders(id) ON DELETE SET NULL,
  appointment_date  DATE NOT NULL,
  appointment_time  TIME NOT NULL,
  service           TEXT NOT NULL,
  status            public.status_agendamento NOT NULL DEFAULT 'agendado',
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_appointments_office_date ON public.appointments(office_id, appointment_date);

CREATE TRIGGER trg_appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- FINANCIAL_TRANSACTIONS — financeiro
-- =============================================================================

CREATE TABLE public.financial_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id         UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  type              public.tipo_lancamento NOT NULL,
  description       TEXT NOT NULL,
  amount            NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  payment_method    public.forma_pagamento NOT NULL DEFAULT 'pix',
  transaction_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  paid              BOOLEAN NOT NULL DEFAULT TRUE,
  due_date          DATE,
  service_order_id  UUID REFERENCES public.service_orders(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_financial_transactions_office ON public.financial_transactions(office_id);
CREATE INDEX idx_financial_transactions_office_date ON public.financial_transactions(office_id, transaction_date);

CREATE TRIGGER trg_financial_transactions_updated_at
  BEFORE UPDATE ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- WARRANTIES — garantias (normalizadas a partir da OS)
-- =============================================================================

CREATE TABLE public.warranties (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id         UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  service_order_id  UUID NOT NULL UNIQUE REFERENCES public.service_orders(id) ON DELETE CASCADE,
  customer_id       UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  motorcycle_id     UUID NOT NULL REFERENCES public.motorcycles(id) ON DELETE RESTRICT,
  warranty_days     INTEGER NOT NULL CHECK (warranty_days > 0),
  starts_at         DATE NOT NULL,
  expires_at        DATE NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_warranties_office_active ON public.warranties(office_id, is_active);
CREATE INDEX idx_warranties_motorcycle ON public.warranties(motorcycle_id);

CREATE TRIGGER trg_warranties_updated_at
  BEFORE UPDATE ON public.warranties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- Row Level Security (RLS) — preparado para login multi-oficina
-- Políticas usam profiles.office_id do usuário autenticado.
-- Descomente após configurar Auth; durante dev local o app usa localStorage.
-- =============================================================================

ALTER TABLE public.offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motorcycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_order_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warranties ENABLE ROW LEVEL SECURITY;

-- Helper: office_id do usuário logado
CREATE OR REPLACE FUNCTION public.current_office_id()
RETURNS UUID AS $$
  SELECT office_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Exemplo de política tenant (repetir padrão por tabela após ativar login):
-- CREATE POLICY "tenant_select" ON public.customers
--   FOR SELECT USING (office_id = public.current_office_id());
-- CREATE POLICY "tenant_insert" ON public.customers
--   FOR INSERT WITH CHECK (office_id = public.current_office_id());
-- CREATE POLICY "tenant_update" ON public.customers
--   FOR UPDATE USING (office_id = public.current_office_id());
-- CREATE POLICY "tenant_delete" ON public.customers
--   FOR DELETE USING (office_id = public.current_office_id());

-- Perfil: usuário só vê/edita o próprio profile
-- CREATE POLICY "profiles_self" ON public.profiles
--   FOR ALL USING (id = auth.uid());

-- =============================================================================
-- Trigger: criar profile + settings ao registrar usuário (futuro)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Implementar após fluxo de onboarding escolher office_id
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- CREATE TRIGGER on_auth_user_created
--   AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- Storage bucket sugerido (executar no dashboard ou via API)
-- =============================================================================
-- Bucket: service-order-photos (private)
-- Política: upload/read restrito a office_id via custom claim ou path prefix

-- =============================================================================
-- Dados demo opcionais (Craft Montes Claros)
-- =============================================================================

-- INSERT INTO public.offices (id, name, address, phone, cnpj, email) VALUES
--   ('00000000-0000-4000-8000-000000000001', 'Craft',
--    'Av. Felíciano Martins de Freitas, 645A - Vila Regina, Montes Claros - MG, 39400-207',
--    '(38) 99172-4242', '12.345.678/0001-90', 'contato@craftoficina.com.br');
--
-- INSERT INTO public.settings (office_id) VALUES
--   ('00000000-0000-4000-8000-000000000001');
