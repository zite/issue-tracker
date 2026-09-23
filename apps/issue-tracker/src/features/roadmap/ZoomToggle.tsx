import { Segmented } from '../../ui/Form';
import { ZOOMS, type Zoom } from './scale';

const OPTIONS = ZOOMS.map(z => ({ value: z.value, label: z.label, title: `Zoom to ${z.label.toLowerCase()}` }));

/** Weeks · Months · Quarters. */
export function ZoomToggle({ value, onChange, className }: { value: Zoom; onChange: (zoom: Zoom) => void; className?: string }) {
  return <Segmented value={value} onChange={onChange} options={OPTIONS} className={className} />;
}
