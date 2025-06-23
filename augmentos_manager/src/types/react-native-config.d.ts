declare module 'react-native-config' {
  export interface NativeConfig {
    // Supabase settings
    SUPABASE_URL?: string;
    SUPABASE_ANON_KEY?: string;
    
    // Backend connection settings
    MENTRAOS_HOST?: string;
    MENTRAOS_PORT?: string;
    MENTRAOS_SECURE?: string;
    MENTRAOS_VERSION?: string;
    MENTRAOS_APPSTORE_URL?: string;
  }
  
  export const Config: NativeConfig;
  export default Config;
}