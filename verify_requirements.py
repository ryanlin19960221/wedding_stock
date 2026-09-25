import re

def test_requirements():
    with open('index.html', 'r', encoding='utf-8') as f:
        html = f.read()

    with open('index.css', 'r', encoding='utf-8') as f:
        css = f.read()

    with open('app.js', 'r', encoding='utf-8') as f:
        js = f.read()

    # 1. HTML checks
    assert 'btnDuration5s' in html, 'Missing btnDuration5s in HTML'
    assert 'btnDuration10s' in html, 'Missing btnDuration10s in HTML'
    assert 'btnFsDuration5s' in html, 'Missing btnFsDuration5s in HTML'
    assert 'btnFsDuration10s' in html, 'Missing btnFsDuration10s in HTML'
    assert '抽捧花大作戰' in html, 'Missing title in HTML'
    assert '5 秒播完' in html, 'Missing 5s button text'
    assert '10 秒播完' in html, 'Missing 10s button text'

    # 2. CSS checks
    assert '.sz-btn-duration' in css, 'Missing .sz-btn-duration in CSS'
    assert '.sz-duration-group' in css, 'Missing .sz-duration-group in CSS'
    assert '.sz-fs-duration-group' in css, 'Missing .sz-fs-duration-group in CSS'

    # 3. JavaScript checks
    assert '8150' in js and '6462' in js and '6756' in js and '4968' in js and '6104' in js, 'Missing default 100 TWD semiconductor stocks'
    assert '{value} 元' in js, 'Y-axis formatter not in 元'
    assert 'yAxis: 100' in js, 'Missing 100 TWD benchmark markline'
    assert 'targetDurationSec' in js, 'Missing targetDurationSec'
    assert 'setAnimationDuration' in js, 'Missing setAnimationDuration function'
    assert 'b.price - a.price' in js, 'Ranking table not sorted by stock price'
    assert 'requestAnimationFrame' in js, 'Missing requestAnimationFrame loop'

    print('SUCCESS: All requirements thoroughly verified!')

if __name__ == '__main__':
    test_requirements()
