import Image from 'next/image';
import maji from '../../desktop/build-resources/icon-source.png';
import { EmptyState } from '@/components/ui/EmptyState';

export default function NotFound() {
  return (
    <main className="grid h-screen place-items-center">
      <EmptyState
        title="找不到这个页面"
        illustration={(
          <Image
            src={maji}
            alt=""
            width={104}
            height={104}
          />
        )}
        action={(
          <a
            className="ui-button ui-button-primary"
            href="/"
          >
            回到课程
          </a>
        )}
      >
        这个地址没有对应的页面。
      </EmptyState>
    </main>
  );
}
