export function monthDays(year,month){
 const count=new Date(Date.UTC(year,month,0)).getUTCDate(),offset=(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7,values=Array(offset).fill(null);
 for(let day=1;day<=count;day++)values.push(`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`);
 while(values.length%7)values.push(null);
 return values;
}
export function shiftMonth(year,month,delta){const value=new Date(Date.UTC(year,month-1+delta,1));return {year:value.getUTCFullYear(),month:value.getUTCMonth()+1};}
