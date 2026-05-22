export interface CavemanConfig {
    enabled: boolean;
    defaultMode: 'lite' | 'full' | 'ultra' | 'wenyan-lite' | 'wenyan-full' | 'wenyan-ultra' | 'off';
    features: {
        caveman: boolean;
        commit: boolean;
        review: boolean;
    };
}
export declare function loadConfig(): CavemanConfig;
//# sourceMappingURL=config.d.ts.map