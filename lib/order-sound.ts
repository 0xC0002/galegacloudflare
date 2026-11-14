// A longer cash-register / coin chime shared by Casa and iFood in this lab.
// Keep each voice below full scale; the tablet's media volume is the final limit.
export function playOrderChime(audio:AudioContext){
 const note=(frequency:number,offset:number,length:number,level:number,type:OscillatorType)=>{
  const start=audio.currentTime+.02+offset,oscillator=audio.createOscillator(),gain=audio.createGain();
  oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,start);
  gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(level,start+.008);gain.gain.exponentialRampToValueAtTime(.0001,start+length);
  oscillator.connect(gain);gain.connect(audio.destination);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};oscillator.start(start);oscillator.stop(start+length+.02);
 };
 // Two recognizable register rings, with short coin-like metallic overtones.
 for(const offset of [0,1.1]){
  note(1800,offset,.08,.25,'triangle');note(2400,offset+.1,.1,.25,'triangle');
  note(1320,offset+.24,.74,.48,'triangle');note(2637,offset+.24,.55,.13,'sine');
  note(3520,offset+.27,.3,.06,'sine');
 }
}

// A distinct, sustained alarm for Casa cancellations. Media volume is controlled
// by the device; gain remains bounded and each oscillator is disconnected.
export function playCancellationAlarm(audio:AudioContext){
 for(let i=0;i<8;i++){
  const start=audio.currentTime+.02+i*.45,oscillator=audio.createOscillator(),gain=audio.createGain();
  oscillator.type='square';oscillator.frequency.setValueAtTime(i%2?740:1040,start);
  gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.45,start+.012);
  gain.gain.setValueAtTime(.45,start+.30);gain.gain.exponentialRampToValueAtTime(.0001,start+.39);
  oscillator.connect(gain);gain.connect(audio.destination);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  oscillator.start(start);oscillator.stop(start+.41);
 }
}
