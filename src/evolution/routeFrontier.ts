/** Stable indexed min-heap for bounded pathfinding.
 * Equal priorities retain first-insertion ordering, matching the original
 * linear open-list search. Decreasing a score never duplicates a route tile.
 */
export class RouteFrontier{
  private heap:{index:number;score:number;order:number}[]=[];
  private positions=new Map<number,number>();
  private nextOrder=0;
  get size():number{return this.heap.length;}
  private less(i:number,j:number):boolean{
    const a=this.heap[i],b=this.heap[j];
    return a.score<b.score||a.score===b.score&&a.order<b.order;
  }
  private swap(a:number,b:number):void{
    const v=this.heap[a];
    this.heap[a]=this.heap[b];this.heap[b]=v;
    this.positions.set(this.heap[a].index,a);
    this.positions.set(this.heap[b].index,b);
  }
  private siftUp(i:number):void{
    while(i>0){
      const p=(i-1)>>>1;
      if(!this.less(i,p))break;
      this.swap(i,p);i=p;
    }
  }
  private siftDown(i:number):void{
    while(true){
      const l=i*2+1,r=l+1;
      let min=i;
      if(l<this.heap.length&&this.less(l,min))min=l;
      if(r<this.heap.length&&this.less(r,min))min=r;
      if(min===i)break;
      this.swap(i,min);i=min;
    }
  }
  addOrDecrease(index:number,score:number):void{
    const current=this.positions.get(index);
    if(current!==undefined){
      if(this.heap[current].score<=score)return;
      this.heap[current].score=score;this.siftUp(current);
    }else{
      const i=this.heap.length;
      this.heap.push({index,score,order:this.nextOrder++});
      this.positions.set(index,i);this.siftUp(i);
    }
  }
  pop():number|undefined{
    if(!this.heap.length)return undefined;
    const first=this.heap[0],last=this.heap.pop()!;
    this.positions.delete(first.index);
    if(this.heap.length){
      this.heap[0]=last;
      this.positions.set(last.index,0);
      this.siftDown(0);
    }
    return first.index;
  }
}
