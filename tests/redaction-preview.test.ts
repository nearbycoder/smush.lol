import { test, expect } from "bun:test";
import { redactionPreviewFields } from "../web/redaction-preview";
test("redaction preview shares trimmed geometry while excluding outer finishing effects",()=>{
 const fields={borderSize:"100",cornerRadius:"50",trimTransparent:"true",trimThreshold:"10",removeBackground:"true",redactions:"existing",watermarkText:"private"};
 expect(redactionPreviewFields(fields)).toMatchObject({borderSize:"0",cornerRadius:"0",trimTransparent:"true",trimThreshold:"10",removeBackground:"true",redactions:"[]",watermarkText:""});
 expect(redactionPreviewFields({...fields,trimTransparent:"false"}).removeBackground).toBe("false");
 expect(fields.borderSize).toBe("100");
});
