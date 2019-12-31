import jq from 'jquery'

export function monitor_tabs(callback) {
	jq('a[data-toggle="tab"]').on('shown.bs.tab', function (e) {
	  var hash = jq(e.target).attr('href');
		if (callback)
			callback(hash);
	  if (history.pushState) {
		history.replaceState(null, null, hash);
	  } else {
		location.hash = hash;
	  }
	});

	var hash = window.location.hash;
	if (hash) {
	  jq('.nav-link[href="' + hash + '"]').tab('show');
	}
}
