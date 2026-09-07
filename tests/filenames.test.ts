import { test, expect } from "bun:test";
import { batchFilename, namingOptions } from "../web/filenames";
import { ConversionQueue } from "../web/queue";
test("filename tokens preserve real extensions and sanitize source names",()=>{
 expect(batchFilename("{name}-{n}-{format}","../My photo.png",7,"jpeg")).toBe("-My-photo-007-jpg.jpg");
 expect(batchFilename("{name}-{variant}","a.png",1,"webp","320w")).toBe("a-320w.webp");
 expect(batchFilename("{name}","a.png",1,"webp","320w")).toBe("a-320w.webp");
 expect(batchFilename("CON","a.png",1,"png")).toBe("image-CON.png");
 expect(()=>namingOptions("../{name}",1)).toThrow();expect(()=>namingOptions("{unknown}",1)).toThrow();expect(()=>namingOptions("{name}",0)).toThrow();
});
test("queue captures numbering after sorting and keeps names on retry",async()=>{
 let fail=true;const q=new ConversionQueue(async()=>{if(fail)throw Error("retry");return {blob:new Blob(["x"]),filename:"old.png"};});
 q.add([new File(["x"],"b.png"),new File(["x"],"a.png")]);q.sort("name-asc");
 const naming={template:"{n}-{name}",start:7};await q.start({},naming);naming.template="changed";fail=false;
 q.sort("name-desc");for(const job of q.jobs)await q.retry(job.id);
 expect(q.jobs.map(j=>j.result!.filename)).toEqual(["008-b.png","007-a.png"]);
});
