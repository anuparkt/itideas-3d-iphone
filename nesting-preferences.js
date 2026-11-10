/** Local-only CNC quoting preferences. No geometry/file data is persisted. */
const KEY='itideas-cnc-prefs-v1';
const limits={
 nestSheetW:[10,10000],nestSheetH:[10,10000],nestThickness:[.1,100],
 nestSheetPrice:[0,100000],nestMargin:[0,1000],nestGap:[0,1000],
 nestKerf:[0,100],nestQuantity:[1,20],nestCutRate:[0,100000],
 nestSetup:[0,100000],nestTool:[0,100000],nestFinishing:[0,100000],
 nestMarginPct:[0,85],nestVat:[0,30]
};
export function loadNestingPreferences(storage){
 try{
  if(!storage)return {};
  const raw=storage.getItem(KEY);if(!raw)return {};
  const saved=JSON.parse(raw);const result={};
  if(saved&&typeof saved==='object'){
   for(const [key,[min,max]] of Object.entries(limits)){
    const value=Number(saved[key]);
    if(saved[key]!==undefined&&Number.isFinite(value)&&value>=min&&value<=max)result[key]=value;
   }
   if(['bbox','polygon'].includes(saved.nestAlgorithm))result.nestAlgorithm=saved.nestAlgorithm;
   if(['plaswood10-half','plaswood10-full','custom'].includes(saved.nestMaterial))result.nestMaterial=saved.nestMaterial;
   if(typeof saved.nestRotate==='boolean')result.nestRotate=saved.nestRotate;
  }
  return result;
 }catch{return {};}
}
export function saveNestingPreferences(storage,values){
 try{
  if(!storage)return false;
  const clean={};
  for(const [key,[min,max]] of Object.entries(limits)){
   const value=Number(values[key]);
   if(values[key]!==undefined&&Number.isFinite(value)&&value>=min&&value<=max)clean[key]=value;
  }
  if(['bbox','polygon'].includes(values.nestAlgorithm))clean.nestAlgorithm=values.nestAlgorithm;
  if(['plaswood10-half','plaswood10-full','custom'].includes(values.nestMaterial))clean.nestMaterial=values.nestMaterial;
  if(typeof values.nestRotate==='boolean')clean.nestRotate=values.nestRotate;
  storage.setItem(KEY,JSON.stringify(clean));return true;
 }catch{return false;}
}
