interface BacklogItem {
  id: string;
  title: string;
  status: string;
  assignee: string;
  variant: string;
  points: number;
}

const statusColors: Record<string, { dot: string; badge: string }> = {
  Todo: { dot: "bg-slate-300", badge: "bg-slate-100 text-slate-600" },
  "In Progress": { dot: "bg-blue-400", badge: "bg-blue-50 text-blue-700" },
  Review: { dot: "bg-amber-400", badge: "bg-amber-50 text-amber-700" },
  Done: { dot: "bg-emerald-400", badge: "bg-emerald-50 text-emerald-700" },
};

export default function BacklogList({ items }: { items: BacklogItem[] }) {
  return (
    <div className='flex flex-col gap-3'>
      {items.map((item) => {
        const colorSet = statusColors[item.status] || { dot: "bg-slate-300", badge: "bg-slate-100 text-slate-600" };
        return (
          <div key={item.id} className='flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm'>
            <div className='flex items-center gap-3'>
              <span className={['h-2 w-2 rounded-full', colorSet.dot].join(' ')} />
              <div className='flex flex-col'>
                <p className='text-sm font-semibold text-slate-900'>{item.id} - {item.title}</p>
                <span className={['mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em]', colorSet.badge].join(' ')}>
                  {item.status}
                </span>
              </div>
            </div>
            <div className='flex items-center gap-2'>
              <div className='flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700'>
                {item.assignee[0]}
              </div>
              <span className='text-xs font-semibold text-slate-500'>{item.points} pt</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
