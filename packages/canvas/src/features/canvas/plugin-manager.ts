export type CanvasInstalledPlugin = {
    id: string;
    name: string;
    version: string;
    description?: string;
    url: string;
    enabled: boolean;
    local?: boolean;
    official?: boolean;
};

export type CanvasOfficialPlugin = {
    id: string;
    name: string;
    version: string;
    description?: string;
    icon?: string;
    url: string;
};

export type CanvasPluginManager = {
    getSnapshot(): readonly CanvasInstalledPlugin[];
    subscribe(listener: () => void): () => void;
    load(): Promise<void>;
    listOfficial(): Promise<CanvasOfficialPlugin[]>;
    hasUpgrade(installedVersion: string, officialVersion: string): boolean;
    install(url: string, official?: boolean): Promise<CanvasInstalledPlugin>;
    setEnabled(pluginId: string, enabled: boolean): Promise<void>;
    update(pluginId: string): Promise<void>;
    uninstall(pluginId: string): Promise<void>;
};
