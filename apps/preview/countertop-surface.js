// A shared visual datum for all connected countertop pieces.
export const COUNTERTOP_TOP_OFFSET=.035;
export const COUNTERTOP_MIN_FILLET=.003;
export const countertopSurfaceY=({elevation,height})=>elevation+height+COUNTERTOP_TOP_OFFSET;
