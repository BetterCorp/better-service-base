const queryString = 'q=' + encodeURIComponent('topic:bsb-plugin');

curl -H 'Accept: application/vnd.github.text-match+json' 'https://api.github.com/search/repositories?q=topic:bsb-plugin'