/* One operation ID per unchanged draft; a failed response keeps that ID. */
window.SJPostRequests={attach(form){
  let key='',previous='',previousFiles=[];
  const clear=()=>{key='';previous='';previousFiles=[];};
  for(const event of ['input','change','reset'])form.addEventListener(event,clear);
  document.addEventListener('sj:logout',clear);
  return {key(data){
    const files=[],values=[];
    for(const [name,value]of data){
      if(value instanceof Blob){values.push([name,'file',value.name,value.size,value.type,value.lastModified]);files.push(value);}
      else values.push([name,value]);
    }
    const snapshot=JSON.stringify(values),owner=window.SJAuth?.user?.id;
    const identity=JSON.stringify([owner,snapshot]);
    if(!key||identity!==previous||files.length!==previousFiles.length||files.some((f,i)=>f!==previousFiles[i])){
      const bytes=crypto.getRandomValues(new Uint8Array(16));
      key=Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');previous=identity;previousFiles=files;
    }
    return key;
  },clear};
}};
