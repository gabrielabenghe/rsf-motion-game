export const ACTIONS = ["ATTACK", "BLOCK", "DODGE", "SPECIAL"] as const;
export type ActionLabel = (typeof ACTIONS)[number];
export type LandmarkSnapshot = { x:number; y:number; z:number; visibility?:number };
export type RecordedHand = { handedness:string|null; landmarks:LandmarkSnapshot[]; worldLandmarks:LandmarkSnapshot[] };
export type RecordedFrame = { timestampMs:number; bodyLandmarks:LandmarkSnapshot[]; bodyWorldLandmarks:LandmarkSnapshot[]; hands:RecordedHand[] };
export type ActionRecording = { label:ActionLabel; recordedAt:number; durationMs:number; frames:RecordedFrame[] };
export type ActionTraining = { label:ActionLabel; learnedAt:number; demonstrations:ActionRecording[] };
export type RecognitionScores = Record<ActionLabel,number>;
type NormalizedPoint = { x:number; y:number };
export type NeutralBaseline = {
  shoulderCenterX:number; shoulderCenterY:number; shoulderWidth:number; noseY:number|null;
  leftWrist:NormalizedPoint; rightWrist:NormalizedPoint;
  leftElbow:NormalizedPoint; rightElbow:NormalizedPoint;
};

export type GestureDebug = {
  shoulderWidth:number;
  leftShoulderVisibility:number; rightShoulderVisibility:number;
  leftElbowVisibility:number; rightElbowVisibility:number;
  leftWristVisibility:number; rightWristVisibility:number;
  leftWristVisible:boolean; rightWristVisible:boolean;
  leftArmUp:boolean; rightArmUp:boolean; leftRaisedAmount:number; rightRaisedAmount:number; specialCondition:boolean;
  leftWristRaisedForBlock:boolean; rightWristRaisedForBlock:boolean;
  leftElbowRaised:boolean; rightElbowRaised:boolean;
  leftForearmInward:boolean; rightForearmInward:boolean; trueCross:boolean;
  leftArmDistanceFromNeutral:number; rightArmDistanceFromNeutral:number;
  wristDistance:number; blockCondition:boolean;
  verticalDrop:number; lateralShift:number; shoulderTilt:number; noseDrop:number;
  dodgeCondition:boolean; leftExtension:number; rightExtension:number;
  rightShoulderX:number; rightShoulderY:number; rightElbowX:number; rightElbowY:number;
  rightWristX:number; rightWristY:number; rightHorizontalExtension:number;
  rightVerticalOffset:number; rightElbowHorizontalExtension:number; attackAngle:number; rightArmSideways:boolean;
  leftWristChestY:number; rightWristChestY:number; strongCross:boolean;
  neutralShoulderCenterY:number; currentShoulderCenterY:number; verticalShoulderDrop:number;
  neutralNoseY:number; currentNoseY:number;
  attackCondition:boolean; rawGesture:ActionLabel|null; baselineReady:boolean;
};
export type RecognitionDebug = GestureDebug & {
  state:"READY"|"HOLDING"|"ACTION_EMITTED"|"SETTLING";
  bestAction:ActionLabel|null; decision:ActionLabel|"NONE"; reason:string;
  usablePose:boolean; readyForNext:boolean; stablePoseMs:number;
  scores:RecognitionScores; activeFrames:number; onsetDetected:boolean;
  runnerUp:ActionLabel|null; distances:RecognitionScores; margin:number;
  movementEnergy:number; leftHandAvailable:boolean; rightHandAvailable:boolean;
};
export type RecognitionResult = { scores:RecognitionScores; detectedAction:ActionLabel|null; emittedAction:ActionLabel|null; latencyMs:number|null; debug?:RecognitionDebug };

export const ACTION_GUIDES:Record<ActionLabel,{title:string;instruction:string;hint:string}>={
  ATTACK:{title:"ATACĂ",instruction:"Întinde brațul drept în lateral.",hint:"Ține brațul aproximativ orizontal."},
  BLOCK:{title:"BLOCHEAZĂ",instruction:"Adu ambele brațe în fața pieptului.",hint:"Brațele pot fi apropiate sau încrucișate."},
  DODGE:{title:"EVITĂ",instruction:"Ghemuiește-te sau apleacă-te într-o parte.",hint:"Poți coborî, te poți apleca la stânga sau la dreapta."},
  SPECIAL:{title:"SPECIAL",instruction:"Ridică ambele brațe.",hint:"Coatele pot rămâne îndoite."},
};

export const GESTURE_VISIBILITY_THRESHOLD=.20;
const LEFT_SHOULDER=11,RIGHT_SHOULDER=12,LEFT_ELBOW=13,RIGHT_ELBOW=14,LEFT_WRIST=15,RIGHT_WRIST=16,NOSE=0;
const HOLD_MS=100, RELEASE_MS=200, POSE_GRACE_MS=160;
const emptyScores=():RecognitionScores=>({ATTACK:0,BLOCK:0,DODGE:0,SPECIAL:0});
const visible=(p?:LandmarkSnapshot)=>Boolean(p&&(p.visibility??1)>=GESTURE_VISIBILITY_THRESHOLD&&Number.isFinite(p.x)&&Number.isFinite(p.y));
const distance=(a:LandmarkSnapshot,b:LandmarkSnapshot)=>Math.hypot(a.x-b.x,a.y-b.y);
const finite=(n:number)=>Number.isFinite(n)?n:0;
const visibility=(p?:LandmarkSnapshot)=>p?.visibility??1;

export function getGestureDebug(landmarks:ReadonlyArray<LandmarkSnapshot>,neutralBaseline:NeutralBaseline|null):GestureDebug{
  const ls=landmarks[LEFT_SHOULDER],rs=landmarks[RIGHT_SHOULDER],le=landmarks[LEFT_ELBOW],re=landmarks[RIGHT_ELBOW],lw=landmarks[LEFT_WRIST],rw=landmarks[RIGHT_WRIST],nose=landmarks[NOSE];
  const upperBodyUsable=[ls,rs,le,re,lw,rw].every(visible);
  if(!upperBodyUsable)return{shoulderWidth:0,leftShoulderVisibility:visibility(ls),rightShoulderVisibility:visibility(rs),leftElbowVisibility:visibility(le),rightElbowVisibility:visibility(re),leftWristVisibility:visibility(lw),rightWristVisibility:visibility(rw),leftWristVisible:visible(lw),rightWristVisible:visible(rw),leftArmUp:false,rightArmUp:false,leftRaisedAmount:0,rightRaisedAmount:0,specialCondition:false,leftWristRaisedForBlock:false,rightWristRaisedForBlock:false,leftElbowRaised:false,rightElbowRaised:false,leftForearmInward:false,rightForearmInward:false,trueCross:false,leftArmDistanceFromNeutral:0,rightArmDistanceFromNeutral:0,wristDistance:0,blockCondition:false,verticalDrop:0,lateralShift:0,shoulderTilt:0,noseDrop:0,dodgeCondition:false,leftExtension:0,rightExtension:0,rightShoulderX:rs?.x??0,rightShoulderY:rs?.y??0,rightElbowX:re?.x??0,rightElbowY:re?.y??0,rightWristX:rw?.x??0,rightWristY:rw?.y??0,rightHorizontalExtension:0,rightVerticalOffset:0,rightElbowHorizontalExtension:0,attackAngle:0,rightArmSideways:false,leftWristChestY:0,rightWristChestY:0,strongCross:false,neutralShoulderCenterY:neutralBaseline?.shoulderCenterY??0,currentShoulderCenterY:0,verticalShoulderDrop:0,neutralNoseY:neutralBaseline?.noseY??0,currentNoseY:nose?.y??0,attackCondition:false,rawGesture:null,baselineReady:Boolean(neutralBaseline)};
  const shoulderWidth=Math.max(distance(ls,rs),.0001);
  const shoulderCenterX=(ls.x+rs.x)/2,shoulderCenterY=(ls.y+rs.y)/2;
  const leftRaisedAmount=(ls.y-lw.y)/shoulderWidth;
  const rightRaisedAmount=(rs.y-rw.y)/shoulderWidth;
  const leftArmUp=leftRaisedAmount>-.05;
  const rightArmUp=rightRaisedAmount>-.05;
  const specialCondition=leftArmUp&&rightArmUp;
  const neutralScale=neutralBaseline?.shoulderWidth??shoulderWidth;
  const verticalDrop=neutralBaseline?(shoulderCenterY-neutralBaseline.shoulderCenterY)/neutralScale:0;
  const lateralShift=neutralBaseline?Math.abs(shoulderCenterX-neutralBaseline.shoulderCenterX)/shoulderWidth:0;
  const shoulderTilt=Math.abs(ls.y-rs.y)/shoulderWidth;
  const noseDrop=neutralBaseline&&neutralBaseline.noseY!==null&&visible(nose)?(nose.y-neutralBaseline.noseY)/neutralScale:0;
  const wristDistance=distance(lw,rw)/shoulderWidth;
  const normalize=(point:LandmarkSnapshot):NormalizedPoint=>({x:(point.x-shoulderCenterX)/shoulderWidth,y:(point.y-shoulderCenterY)/shoulderWidth});
  const nlw=normalize(lw),nrw=normalize(rw),nle=normalize(le),nre=normalize(re);
  const leftWristChestY=(lw.y-shoulderCenterY)/shoulderWidth;
  const rightWristChestY=(rw.y-shoulderCenterY)/shoulderWidth;
  const leftWristRaisedForBlock=leftWristChestY>-.20&&leftWristChestY<.90;
  const rightWristRaisedForBlock=rightWristChestY>-.20&&rightWristChestY<.90;
  const leftElbowRaised=neutralBaseline!==null&&nle.y<.78&&neutralBaseline.leftElbow.y-nle.y>.08;
  const rightElbowRaised=neutralBaseline!==null&&nre.y<.78&&neutralBaseline.rightElbow.y-nre.y>.08;
  const leftForearmInward=Math.abs(lw.x-shoulderCenterX)<Math.abs(le.x-shoulderCenterX)+.10*shoulderWidth;
  const rightForearmInward=Math.abs(rw.x-shoulderCenterX)<Math.abs(re.x-shoulderCenterX)+.10*shoulderWidth;
  const trueCross=lw.x>=shoulderCenterX&&rw.x<=shoulderCenterX;
  const armDistance=(wrist:NormalizedPoint,elbow:NormalizedPoint,neutralWrist:NormalizedPoint,neutralElbow:NormalizedPoint)=>Math.hypot(wrist.x-neutralWrist.x,wrist.y-neutralWrist.y,elbow.x-neutralElbow.x,elbow.y-neutralElbow.y);
  const leftArmDistanceFromNeutral=neutralBaseline?armDistance(nlw,nle,neutralBaseline.leftWrist,neutralBaseline.leftElbow):0;
  const rightArmDistanceFromNeutral=neutralBaseline?armDistance(nrw,nre,neutralBaseline.rightWrist,neutralBaseline.rightElbow):0;
  const clearlyDifferentFromNeutral=leftArmDistanceFromNeutral>.30&&rightArmDistanceFromNeutral>.30;
  const leftOppositeShoulder=distance(lw,rs)<=distance(lw,ls)+.15*shoulderWidth;
  const rightOppositeShoulder=distance(rw,ls)<=distance(rw,rs)+.15*shoulderWidth;
  const strongCross=leftOppositeShoulder&&rightOppositeShoulder;
  const looseGuard=(wristDistance<1.0||strongCross)&&leftForearmInward&&rightForearmInward;
  const uprightForBlock=Math.abs(verticalDrop)<.18&&shoulderTilt<.16;
  const blockCondition=Boolean(neutralBaseline)&&uprightForBlock&&leftWristRaisedForBlock&&rightWristRaisedForBlock&&clearlyDifferentFromNeutral&&looseGuard;
  const dodgeCondition=Boolean(neutralBaseline)&&(verticalDrop>.25||noseDrop>.28);
  const leftExtension=Math.abs(lw.x-ls.x)/shoulderWidth;
  const rightExtension=Math.abs(rw.x-rs.x)/shoulderWidth;
  const rightHorizontalExtension=rightExtension;
  const rightVerticalOffset=Math.abs(rw.y-rs.y)/shoulderWidth;
  const rightElbowHorizontalExtension=Math.abs(re.x-rs.x)/shoulderWidth;
  const attackAngle=Math.atan2(Math.abs(rw.y-rs.y),Math.max(Math.abs(rw.x-rs.x),.0001))*180/Math.PI;
  const rightArmSideways=rightHorizontalExtension>.65&&rightVerticalOffset<.60&&attackAngle<40;
  const attackCondition=rightArmSideways;
  const rawGesture=specialCondition?"SPECIAL":blockCondition?"BLOCK":dodgeCondition?"DODGE":attackCondition?"ATTACK":null;
  return{shoulderWidth,leftShoulderVisibility:visibility(ls),rightShoulderVisibility:visibility(rs),leftElbowVisibility:visibility(le),rightElbowVisibility:visibility(re),leftWristVisibility:visibility(lw),rightWristVisibility:visibility(rw),leftWristVisible:true,rightWristVisible:true,leftArmUp,rightArmUp,leftRaisedAmount:finite(leftRaisedAmount),rightRaisedAmount:finite(rightRaisedAmount),specialCondition,leftWristRaisedForBlock,rightWristRaisedForBlock,leftElbowRaised,rightElbowRaised,leftForearmInward,rightForearmInward,trueCross,leftArmDistanceFromNeutral:finite(leftArmDistanceFromNeutral),rightArmDistanceFromNeutral:finite(rightArmDistanceFromNeutral),wristDistance:finite(wristDistance),blockCondition,verticalDrop:finite(verticalDrop),lateralShift:finite(lateralShift),shoulderTilt:finite(shoulderTilt),noseDrop:finite(noseDrop),dodgeCondition,leftExtension:finite(leftExtension),rightExtension:finite(rightExtension),rightShoulderX:rs.x,rightShoulderY:rs.y,rightElbowX:re.x,rightElbowY:re.y,rightWristX:rw.x,rightWristY:rw.y,rightHorizontalExtension:finite(rightHorizontalExtension),rightVerticalOffset:finite(rightVerticalOffset),rightElbowHorizontalExtension:finite(rightElbowHorizontalExtension),attackAngle:finite(attackAngle),rightArmSideways,leftWristChestY:finite(leftWristChestY),rightWristChestY:finite(rightWristChestY),strongCross,neutralShoulderCenterY:neutralBaseline?.shoulderCenterY??0,currentShoulderCenterY:shoulderCenterY,verticalShoulderDrop:finite(verticalDrop),neutralNoseY:neutralBaseline?.noseY??0,currentNoseY:visible(nose)?nose.y:0,attackCondition,rawGesture,baselineReady:Boolean(neutralBaseline)};
}

/** The only authoritative gesture decision. Priority is SPECIAL → BLOCK → DODGE → ATTACK. */
export function detectGesture(landmarks:ReadonlyArray<LandmarkSnapshot>,neutralBaseline:NeutralBaseline|null):ActionLabel|null{
  return getGestureDebug(landmarks,neutralBaseline).rawGesture;
}

const median=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)]};
class NeutralBaselineCollector{
  private startedAt:number|null=null;
  private samples:Array<{x:number;y:number;width:number;nose:number|null;lw:NormalizedPoint;rw:NormalizedPoint;le:NormalizedPoint;re:NormalizedPoint}>=[];
  baseline:NeutralBaseline|null=null;
  reset(){this.startedAt=null;this.samples=[];this.baseline=null}
  add(landmarks:ReadonlyArray<LandmarkSnapshot>,timestamp:number){
    if(this.baseline)return;
    const ls=landmarks[LEFT_SHOULDER],rs=landmarks[RIGHT_SHOULDER],le=landmarks[LEFT_ELBOW],re=landmarks[RIGHT_ELBOW],lw=landmarks[LEFT_WRIST],rw=landmarks[RIGHT_WRIST],nose=landmarks[NOSE];
    if(![ls,rs,le,re,lw,rw].every(visible))return;
    const width=Math.max(distance(ls,rs),.0001),tilt=Math.abs(ls.y-rs.y)/width;
    if(tilt>.16){this.startedAt=null;this.samples=[];return}
    const centerX=(ls.x+rs.x)/2,centerY=(ls.y+rs.y)/2;
    const normalized=(point:LandmarkSnapshot):NormalizedPoint=>({x:(point.x-centerX)/width,y:(point.y-centerY)/width});
    this.startedAt??=timestamp;
    this.samples.push({x:centerX,y:centerY,width,nose:visible(nose)?nose.y:null,lw:normalized(lw),rw:normalized(rw),le:normalized(le),re:normalized(re)});
    if(timestamp-this.startedAt>=800&&this.samples.length>=8){
      const noses=this.samples.flatMap(sample=>sample.nose===null?[]:[sample.nose]);
      const pointMedian=(key:"lw"|"rw"|"le"|"re"):NormalizedPoint=>({x:median(this.samples.map(s=>s[key].x)),y:median(this.samples.map(s=>s[key].y))});
      this.baseline={shoulderCenterX:median(this.samples.map(s=>s.x)),shoulderCenterY:median(this.samples.map(s=>s.y)),shoulderWidth:median(this.samples.map(s=>s.width)),noseY:noses.length?median(noses):null,leftWrist:pointMedian("lw"),rightWrist:pointMedian("rw"),leftElbow:pointMedian("le"),rightElbow:pointMedian("re")};
    }
  }
}

class GestureLatch{
  private candidate:ActionLabel|null=null;private candidateSince=0;
  private latched:ActionLabel|null=null;private absentSince=0;
  reset(){this.candidate=null;this.candidateSince=0;this.latched=null;this.absentSince=0}
  update(raw:ActionLabel|null,timestamp:number):ActionLabel|null{
    if(this.latched){
      if(raw!==this.latched){this.absentSince||=timestamp;if(timestamp-this.absentSince>=RELEASE_MS){this.latched=null;this.absentSince=0;this.candidate=null}}
      else this.absentSince=0;
      return null;
    }
    if(!raw){this.candidate=null;this.candidateSince=0;return null}
    if(this.candidate!==raw){this.candidate=raw;this.candidateSince=timestamp;return null}
    if(timestamp-this.candidateSince<HOLD_MS)return null;
    this.latched=raw;return raw;
  }
  get isLatched(){return this.latched!==null}
}

/** Runtime adapter: landmarks → detectGesture() → latch. It contains no classifier. */
export class MovementRecognizer{
  private baselineCollector=new NeutralBaselineCollector();private latch=new GestureLatch();
  private latestUsable:ReadonlyArray<LandmarkSnapshot>|null=null;private latestUsableAt=0;
  constructor(_unused?:unknown){void _unused}
  resetRuntime(){this.latch.reset()}
  resetBaseline(){this.baselineCollector.reset();this.latestUsable=null;this.latestUsableAt=0;this.latch.reset()}
  addFrame(frame:RecordedFrame,timestamp:number):RecognitionResult{
    const landmarks=frame.bodyLandmarks;
    this.baselineCollector.add(landmarks,timestamp);
    const required=[landmarks[LEFT_SHOULDER],landmarks[RIGHT_SHOULDER],landmarks[LEFT_ELBOW],landmarks[RIGHT_ELBOW],landmarks[LEFT_WRIST],landmarks[RIGHT_WRIST]].every(visible);
    if(required){this.latestUsable=landmarks;this.latestUsableAt=timestamp}
    const effective=required?landmarks:timestamp-this.latestUsableAt<=POSE_GRACE_MS&&this.latestUsable?this.latestUsable:landmarks;
    const raw=detectGesture(effective,this.baselineCollector.baseline);
    const debug=getGestureDebug(effective,this.baselineCollector.baseline);
    const emitted=this.latch.update(raw,timestamp),scores=emptyScores();if(raw)scores[raw]=1;
    return{scores,detectedAction:raw,emittedAction:emitted,latencyMs:emitted?HOLD_MS:null,debug:{...debug,state:this.latch.isLatched?"ACTION_EMITTED":raw?"HOLDING":"READY",bestAction:raw,decision:emitted??"NONE",reason:!debug.baselineReady?"Capturing neutral baseline":raw?`Raw gesture: ${raw}`:"No gesture",usablePose:required,readyForNext:!this.latch.isLatched,stablePoseMs:0,scores,activeFrames:raw?1:0,onsetDetected:Boolean(raw),runnerUp:null,distances:scores,margin:raw?1:0,movementEnergy:0,leftHandAvailable:false,rightHandAvailable:false}};
  }
}

// Compatibility-only types for unreachable legacy development panels.
export type TrainingDiagnostics={actions:Record<ActionLabel,{selfSimilarity:number;closestAction:ActionLabel;separation:"GOOD"|"FAIR"|"POOR";leaveOneOutCorrect:number;leaveOneOutTotal:number}>;similarPairs:Array<{first:ActionLabel;second:ActionLabel;similarity:number}>};
export function findInconsistentDemonstration(...unused:unknown[]){void unused;return null}
export function analyzeTrainingSet(...unused:unknown[]){void unused;return{actions:Object.fromEntries(ACTIONS.map((a,i)=>[a,{selfSimilarity:100,closestAction:ACTIONS[(i+1)%4],separation:"GOOD",leaveOneOutCorrect:0,leaveOneOutTotal:0}])) as TrainingDiagnostics["actions"],similarPairs:[]}}

export function runDetectGestureSyntheticTests(){
  const p=(x:number,y:number):LandmarkSnapshot=>({x,y,z:0,visibility:1});
  const pose=(changes:Record<number,[number,number]>)=>{const points=Array.from({length:33},()=>p(.5,.5));Object.entries(changes).forEach(([i,[x,y]])=>points[+i]=p(x,y));return points};
  const neutral:NeutralBaseline={shoulderCenterX:.5,shoulderCenterY:.4,shoulderWidth:.2,noseY:.2,leftElbow:{x:-.6,y:.75},rightElbow:{x:.6,y:.75},leftWrist:{x:-.6,y:1.6},rightWrist:{x:.6,y:1.6}};
  const base={0:[.5,.2],11:[.4,.4],12:[.6,.4],13:[.38,.55],14:[.62,.55],15:[.38,.72],16:[.62,.72]} as Record<number,[number,number]>;
  const scale=.6,center={x:.5,y:.4};
  const scaledBaseline:NeutralBaseline={...neutral,shoulderCenterX:center.x+(neutral.shoulderCenterX-center.x)*scale,shoulderCenterY:center.y+(neutral.shoulderCenterY-center.y)*scale,shoulderWidth:neutral.shoulderWidth*scale,noseY:neutral.noseY===null?null:center.y+(neutral.noseY-center.y)*scale};
  const makePose=(changes:Record<number,[number,number]>)=>pose({...base,...changes});
  const scalePose=(points:LandmarkSnapshot[])=>points.map(point=>({...point,x:center.x+(point.x-center.x)*scale,y:center.y+(point.y-center.y)*scale}));
  const check=(changes:Record<number,[number,number]>)=>detectGesture(makePose(changes),neutral);
  const checkFar=(changes:Record<number,[number,number]>)=>detectGesture(scalePose(makePose(changes)),scaledBaseline);
  const attackPose={14:[.72,.43],16:[.84,.44]} as Record<number,[number,number]>;
  const blockPose={13:[.36,.49],14:[.64,.49],15:[.52,.48],16:[.48,.48]} as Record<number,[number,number]>;
  const dodgePose={0:[.5,.28],11:[.4,.46],12:[.6,.46],13:[.38,.58],14:[.62,.58],15:[.38,.75],16:[.62,.75]} as Record<number,[number,number]>;
  const specialPose={15:[.36,.36],16:[.64,.36]} as Record<number,[number,number]>;
  return{
    bothWristsAboveShoulders:check(specialPose),
    specialFarScale:checkFar(specialPose),
    clearCrossBlock:check(blockPose),
    clearCrossBlockFarScale:checkFar(blockPose),
    looseCrossBlock:check({13:[.35,.49],14:[.65,.49],15:[.48,.50],16:[.52,.50]}),
    inwardGuardBlock:check({13:[.36,.50],14:[.64,.50],15:[.47,.51],16:[.53,.51]}),
    unevenWristsBlock:check({13:[.36,.48],14:[.64,.51],15:[.52,.46],16:[.48,.52]}),
    unevenElbowsBlock:check({13:[.35,.46],14:[.65,.52],15:[.48,.48],16:[.52,.51]}),
    shouldersLowered:check(dodgePose),
    shouldersLoweredFarScale:checkFar(dodgePose),
    crouchWithRandomArms:check({...dodgePose,13:[.30,.56],14:[.68,.60],15:[.22,.63],16:[.74,.70]}),
    shouldersShiftedSideways:check({0:[.65,.2],11:[.55,.4],12:[.75,.4],13:[.54,.55],14:[.76,.55],15:[.54,.72],16:[.76,.72]}),
    rightArmRawXGreater:check(attackPose),
    rightArmFarScale:checkFar(attackPose),
    rightArmRawXLess:check({14:[.48,.43],16:[.34,.44]}),
    rightArmSlightlyBent:check({14:[.73,.44],16:[.82,.46]}),
    rightArmAboveHorizontal:check({14:[.72,.35],16:[.84,.30]}),
    rightArmBelowHorizontal:check({14:[.72,.46],16:[.84,.50]}),
    rightArmDown:check({14:[.62,.55],16:[.62,.72]}),
    rightArmStraightUp:check({14:[.62,.25],16:[.62,.10]}),
    leftArmExtended:check({13:[.28,.45],15:[.16,.45]}),
    neutral:check({}),
    neutralHandsForward:check({13:[.41,.56],14:[.59,.56],15:[.44,.69],16:[.56,.69]}),
    neutralHandsCloser:check({13:[.42,.55],14:[.58,.55],15:[.43,.71],16:[.57,.71]}),
    neutralOneHandHigher:check({15:[.39,.62],16:[.61,.72]}),
    neutralAsymmetric:check({13:[.37,.54],14:[.63,.57],15:[.36,.69],16:[.61,.73]}),
  };
}

export function runGestureLatchRegressionTests(){
  const latch=new GestureLatch();
  const firstWarmup=latch.update("ATTACK",0);
  const firstAttack=latch.update("ATTACK",100);
  const heldAttack=latch.update("ATTACK",250);
  latch.update(null,300);
  latch.update(null,500);
  const secondWarmup=latch.update("ATTACK",501);
  const secondAttack=latch.update("ATTACK",601);
  return{
    firstAttackEmits:firstWarmup===null&&firstAttack==="ATTACK",
    heldAttackDoesNotRepeat:heldAttack===null,
    neutralRearms:secondWarmup===null&&secondAttack==="ATTACK",
  };
}
