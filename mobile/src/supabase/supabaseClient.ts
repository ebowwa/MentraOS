// supabaseClient.ts
import AsyncStorage from "@react-native-async-storage/async-storage"
import {createClient} from "@supabase/supabase-js"

const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL as string) || "https://auth.mentra.glass"
const SUPABASE_ANON_KEY =
  (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string) ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrYml1bnpmYmJ0d2x6ZHBybWVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQyODA2OTMsImV4cCI6MjA0OTg1NjY5M30.rbEsE8IRz-gb3-D0H8VAJtGw-xvipl1Nc-gCnnQ748U"

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
