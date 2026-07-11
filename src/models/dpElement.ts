/** Datapoint Element from ident.sqlite datapoint_element table */
export interface DpElement {
    el_id: number;
    dpt_id: number;
    position_in_type: number;
    parent_el_id: number;
    datatype: number;
    referenced_type: number;
    source_dpt_id: number;
    source_el_id: number;
    canonical_name: string;
    /** 64-bit epoch value, cast to TEXT in SQL to avoid JS number overflow */
    modification_time: string;
}
