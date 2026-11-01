/*
 * Shared, contract-driven facade sizing objectives.
 * All dimensions are metres. See docs/logic-contract.md before changing.
 * The 45–55 cm range is a design target, not an excuse to create tiny doors
 * or to move manually placed equipment without explicit preview/approval.
 */
export const OPTIMIZATION_RULES=Object.freeze({
 preferredMin:.45,preferredMax:.55,
 fixtureSearchStep:.01,maxFixtureShift:.38,
 sinkDoorLeaves:2
});
export function facadeWidthPenalty(width){
 const {preferredMin:min,preferredMax:max}=OPTIMIZATION_RULES;
 const delta=width<min?min-width:width>max?width-max:0;
 return delta*delta;
}
/* Candidate bay counts are selected from actual length, not a fixed
   88cm unit grid. Honour user-defined physical min/max when feasible. */
export function chooseFacadeBayCount(span,{minimum=.30,maximum=.62}={}){
 if(!(span>0)||!(maximum>=minimum)||!(minimum>0))throw Error('ابعاد تقسیم نما معتبر نیست.');
 const maxCount=Math.max(1,Math.ceil(span/minimum));
 let best=null;
 for(let count=1;count<=maxCount;count++){
  const width=span/count;
  if(width<minimum-1e-7||width>maximum+1e-7)continue;
  const penalty=facadeWidthPenalty(width)*count+Math.abs(width-.50)*.0001;
  if(!best||penalty<best.penalty-1e-9||
    Math.abs(penalty-best.penalty)<1e-9&&count<best.count)
   best={count,penalty,width};
 }
 // Some short or awkward lengths have no exact feasible partition. Keeping
 // one bay lets the caller report the conflict instead of hiding a filler.
 return best?.count??1;
}
