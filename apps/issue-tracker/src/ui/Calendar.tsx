import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { DayPicker, type DayPickerSingleProps } from 'react-day-picker';
import { cn } from './cn';

/** react-day-picker v8, dressed in Issue Tracker's tokens. Weeks start on Monday. */
export function Calendar({ className, ...props }: Omit<DayPickerSingleProps, 'mode'> & { className?: string }) {
  return (
    <DayPicker
      mode="single"
      weekStartsOn={1}
      showOutsideDays
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col',
        month: 'space-y-3',
        caption: 'relative flex h-7 items-center justify-center',
        caption_label: 'font-display text-[17px] text-ink',
        nav: 'flex items-center',
        nav_button: 'absolute top-0 flex h-7 w-7 items-center justify-center rounded-sm text-ink-2 hover:bg-hover hover:text-ink',
        nav_button_previous: 'left-0',
        nav_button_next: 'right-0',
        table: 'w-full border-collapse',
        head_row: 'flex',
        head_cell: 'w-8 text-micro font-medium uppercase text-ink-3',
        row: 'mt-1 flex w-full',
        cell: 'relative h-8 w-8 p-0 text-center',
        day: 'tabular h-8 w-8 rounded-sm text-ui text-ink hover:bg-hover focus-visible:outline-2',
        day_selected: '!bg-primary !text-on-primary hover:!bg-primary',
        day_today: 'font-semibold underline decoration-highlight decoration-[3px] underline-offset-4',
        day_outside: 'text-ink-3/60',
        day_disabled: 'opacity-40',
      }}
      components={{
        IconLeft: () => <CaretLeft size={14} />,
        IconRight: () => <CaretRight size={14} />,
      }}
      {...props}
    />
  );
}
