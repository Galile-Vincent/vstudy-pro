import darkHero from '../../../resources/onboarding/hero-dark.webp?url';
import lightHero from '../../../resources/onboarding/hero-light.webp?url';
import { tr } from '../../shared/i18n';

export function ProductPreview() {
  return <div className="product-preview-frame">
    <img className="product-preview" src={darkHero} alt={tr('onboarding:preview_label')}/>
    <img className="product-preview-light" src={lightHero} alt="" aria-hidden="true"/>
  </div>;
}
