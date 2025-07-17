export interface App {
    id: string;
    name: string;
    packageName: string;
    description: string;
    publicUrl: string;
    logoURL: string;
    webviewURL?: string;
    isPublic: boolean;
}