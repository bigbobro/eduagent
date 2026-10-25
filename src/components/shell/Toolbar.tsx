import { SegmentedControl } from './SegmentedControl';
import { LearnerSwitcher } from './LearnerSwitcher';
export function Toolbar() {
  return <header className="shell-toolbar" data-testid="main-toolbar"><span aria-hidden="true" /><SegmentedControl /><LearnerSwitcher /></header>;
}
