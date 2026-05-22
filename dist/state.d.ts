export interface CavemanState {
    currentMode: string;
    featuresEnabled: {
        caveman: boolean;
        commit: boolean;
        review: boolean;
    };
}
export declare function getState(sessionId: string): CavemanState;
export declare function setMode(sessionId: string, mode: string): void;
export declare function getMode(sessionId: string): string;
//# sourceMappingURL=state.d.ts.map