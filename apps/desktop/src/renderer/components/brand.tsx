/** Owner-supplied brand art follows the resolved app scheme, including custom theme packs. */
import symbol from '../../../../../assets/brand/generated/symbol.svg';
import light from '../../../../../assets/brand/generated/lockup-light.svg';
import dark from '../../../../../assets/brand/generated/lockup-dark.svg';
import './brand.css';

export function Brand({ lockup = false, className = '' }: { lockup?: boolean; className?: string }) {
  return <span className={`vstudy-brand ${lockup ? 'vstudy-lockup' : 'vstudy-symbol'} ${className}`} aria-hidden="true">
    <img src={lockup ? light : symbol} width={lockup ? 926 : 226} height={lockup ? 193 : 178} alt=""/>
    {lockup && <img className="vstudy-brand-dark" src={dark} width="926" height="193" alt=""/>}
  </span>;
}
