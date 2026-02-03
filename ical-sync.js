// iCalカレンダー同期機能

async function syncCalendar(kidId) {
    const urlInput = document.getElementById(`icalUrl${kidId.slice(-1)}`);
    const url = urlInput.value.trim();
    
    if (!url) {
        alert('URLを入力してください。');
        return;
    }
    
    try {
        // CORS問題を回避するためのプロキシサービスを使用
        const proxyUrl = 'https://api.allorigins.win/raw?url=';
        const response = await fetch(proxyUrl + encodeURIComponent(url));
        
        if (!response.ok) {
            throw new Error('カレンダーの取得に失敗しました。');
        }
        
        const icalData = await response.text();
        parseAndAddEvents(icalData, kidId);
        saveIcalUrls();
        
        alert(`${kidsConfig[kidId].name}のカレンダーを同期しました！`);
    } catch (error) {
        console.error('同期エラー:', error);
        alert('同期に失敗しました。URLを確認してください。\n\nヒント：Googleカレンダーの場合、「非公開URL」を使用してください。');
    }
}

function parseAndAddEvents(icalData, kidId) {
    try {
        const jcalData = ICAL.parse(icalData);
        const comp = new ICAL.Component(jcalData);
        const vevents = comp.getAllSubcomponents('vevent');
        
        const events = loadEvents();
        
        // 既存のiCalイベントを削除（同じkidのもの）
        const filteredEvents = events.filter(e => 
            !(e.extendedProps.fromIcal && e.extendedProps.kid === kidId)
        );
        
        // 新しいイベントを追加
        vevents.forEach(vevent => {
            const event = new ICAL.Event(vevent);
            
            const eventData = {
                id: `ical-${kidId}-${event.uid}`,
                title: `${kidsConfig[kidId].name}: ${event.summary}`,
                start: event.startDate.toJSDate().toISOString(),
                end: event.endDate.toJSDate().toISOString(),
                backgroundColor: kidsConfig[kidId].color,
                borderColor: kidsConfig[kidId].color,
                extendedProps: {
                    kid: kidId,
                    description: event.description || '',
                    originalTitle: event.summary,
                    fromIcal: true,
                    icalUid: event.uid
                }
            };
            
            filteredEvents.push(eventData);
        });
        
        saveEvents(filteredEvents);
        calendar.removeAllEvents();
        calendar.addEventSource(filteredEvents);
        filterEvents();
        
    } catch (error) {
        console.error('iCal解析エラー:', error);
        throw new Error('カレンダーデータの解析に失敗しました。');
    }
}