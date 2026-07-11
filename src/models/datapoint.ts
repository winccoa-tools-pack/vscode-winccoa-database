/** Datapoint instance from ident.sqlite datapoint table */
export interface Datapoint {
    dp_id: number;
    dpt_id: number;
    canonical_name: string;
    /** 64-bit epoch value, cast to TEXT in SQL to avoid JS number overflow */
    modification_time: string;
}
