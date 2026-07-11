/** Datapoint Type from ident.sqlite datapoint_type table */
export interface DpType {
    dpt_id: number;
    canonical_name: string;
    next_free_el_id: number;
    /** 64-bit epoch value, cast to TEXT in SQL to avoid JS number overflow */
    modification_time: string;
}
