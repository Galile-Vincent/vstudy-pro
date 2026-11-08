export async function seedRoute(page,route) {
  await page.evaluate(route=>{
    window.localStorage.removeItem('vstudy-tabs-v1');
    window.localStorage.setItem('vstudy-route',JSON.stringify(route));
    const set=window.Storage.prototype.setItem;
    window.Storage.prototype.setItem=function(key,value){if(key!=='vstudy-tabs-v1')set.call(this,key,value);};
  },route);
}
