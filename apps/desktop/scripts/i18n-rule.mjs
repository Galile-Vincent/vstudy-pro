// Product names, native language names and technical units remain recognizable in every locale.
const allowed = new Set(['VStudy','Pro','English','繁體中文','日本語','Markdown','JSON','CSV','USD','© OpenStreetMap contributors','M']);
const visible = new Set(['title','placeholder','aria-label','alt','tooltip']);
export default {
 meta:{type:'problem',schema:[],messages:{literal:'Move user-visible copy to a locale catalog.'}},
 create(context) {
  const check=(node,value)=>{if(value.trim().startsWith('{"my-model":')) return;
   if(/[A-Za-z\u3400-\u9fff\u3040-\u30ff]/u.test(value.trim())&&!allowed.has(value.trim())) context.report({node,messageId:'literal'});};
  const expression = node => {
    if(!node) return;
    if(node.type==='Literal' && typeof node.value==='string') check(node,node.value);
    if(node.type==='ConditionalExpression') {expression(node.consequent);expression(node.alternate);}
    if(node.type==='LogicalExpression') expression(node.right);
    if(node.type==='TemplateLiteral') for(const part of node.quasis) check(part,part.value.cooked);
  };
  return {
   JSXExpressionContainer(node){if(node.parent.type!=='JSXAttribute'||visible.has(node.parent.name.name))expression(node.expression);},
   JSXText(node){check(node,node.value);},
   JSXAttribute(node){if(visible.has(node.name.name)&&node.value?.type==='Literal')check(node.value,node.value.value);},
  };
 },
};
