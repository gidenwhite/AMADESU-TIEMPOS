import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// =========================================================================
// CONFIGURACIÓN DE SUPABASE
// =========================================================================
// ¡ATENCIÓN! Reemplaza estas dos variables con tus credenciales reales.
// Puedes encontrarlas en tu panel de Supabase:
// Project Settings -> API -> Project URL & Project API Keys (anon, public)

const supabaseUrl = 'https://wnkqjsjdwgjnpzognvhb.supabase.co'
const supabaseKey = 'sb_publishable_BURgei8arWiZwYz3tC-Zbw_g_cnJIm5'

export const supabase = createClient(supabaseUrl, supabaseKey)
