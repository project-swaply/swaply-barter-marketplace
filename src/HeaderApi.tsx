import { useState } from 'react';
import { MessageCircle, Menu, Plus, Search, User, X } from 'lucide-react';

type Page='home'|'browse'|'categories'|'listing'|'add'|'offers'|'chat'|'profile'|'login'|'register';

export default function HeaderApi({go,active,authenticated}:{go:(page:Page)=>void;active:Page;authenticated:boolean}) {
  const [open,setOpen]=useState(false);
  const nav=(page:Page)=>{go(page);setOpen(false)};
  const selected:Page=active==='listing'?'browse':active==='register'?'login':active;
  const section=(page:Page)=>selected===page?'active':'';
  const accountPage=authenticated?'profile':'login';
  const accountLabel=authenticated?'Profile':'Sign in';
  return <header>
    <button className="brand" onClick={()=>nav('home')}>Swaply<span>.</span></button>
    <nav className={open?'open':''}>
      <button className={section('home')} onClick={()=>nav('home')}>Home</button>
      <button className={section('browse')} onClick={()=>nav('browse')}>Browse</button>
      <button className={section('categories')} onClick={()=>nav('categories')}>Categories</button>
      <button onClick={()=>{nav('home');setTimeout(()=>document.getElementById('how')?.scrollIntoView({behavior:'smooth'}),0)}}>How it works</button>
      <button className={section('offers')} onClick={()=>nav('offers')}>Offers</button>
      <div className="mobile-actions">
        <button className={section('chat')} onClick={()=>nav('chat')}><MessageCircle/> Messages</button>
        <button className={section(accountPage)} onClick={()=>nav(accountPage)}><User/> {accountLabel}</button>
        <button className="mobile-post" onClick={()=>nav('add')}><Plus/> Post an item</button>
      </div>
    </nav>
    <div className="header-search"><Search/><input placeholder="Search items to trade"/></div>
    <button className={`icon-btn desktop ${section('chat')}`} onClick={()=>nav('chat')} aria-label="Messages"><MessageCircle/></button>
    <button className={`link-btn desktop ${section(accountPage)}`} onClick={()=>nav(accountPage)}><User size={16}/> {accountLabel}</button>
    <button className={`primary desktop ${section('add')}`} onClick={()=>nav('add')}><Plus size={18}/> Post an item</button>
    <button className="menu" onClick={()=>setOpen(!open)} aria-label={open?'Close menu':'Menu'}>{open?<X/>:<Menu/>}</button>
  </header>;
}
