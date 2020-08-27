# webgl-animometer

The WebGL test case extracted from the
[Animometer](https://github.com/WebKit/webkit/tree/master/PerformanceTests/Animometer)
benchmark in the [WebKit](https://webkit.org/) repository. It has been
removed from the overall harness to set the workload at a fixed size.

# Running within Chromium

This page is part of Chromium's
[`tough_webgl_cases`](https://source.chromium.org/chromium/chromium/src/+/master:tools/perf/page_sets/rendering/tough_webgl_cases.py)
performance tests. To run that entire benchmark within that
repository, assuming you've built Chromium in Release mode and are
cd'd into <code>src</code>:

<pre>
./tools/perf/run_benchmark --browser=release rendering.desktop --story=animometer_webgl &gt; output.txt
</pre>

The story names include:
```
animometer_webgl
animometer_webgl_multi_draw
animometer_webgl_indexed
animometer_webgl_indexed_multi_draw
animometer_webgl_indexed_multi_draw_base_vertex_base_instance
```

Look for the `frame_times` measurement in particular; that is a
good indicator of how quickly and reliably the benchmark ran.

# Running locally

Launch an http server at the working directory and navigate the following url in your browser
```
http://localhost:8080/Animometer/tests/3d/webgl.html
```
or
```
http://localhost:8080/Animometer/tests/3d/webgl-indexed-instanced.html
```

Optional url args:

```
webgl_version
use_ubos
use_attributes
use_multi_draw
```

Optional args only for `webgl-indexed-instanced`:

```
use_base_vertex_base_instance
num_geometries
draw_list_update_interval
```

Example:
```
http://localhost:8080/Animometer/tests/3d/webgl.html?webgl_version=2&use_ubos=1&use_multi_draw=1
```

# Re-recording the WPR

Sometimes it's necessary to re-record the web page replay (WPR)
archive in order to run the new version of the test. In this case,
update the page set with the new URL, and run:

<pre>
./tools/perf/record_wpr --upload --browser=system rendering_desktop --story-filter=animometer_webgl
</pre>

# Keeping the gh-pages branch up to date

gh-pages in this repository exactly tracks master. To ensure this,
make the following edit to your .git/config (new lines are in
**bold**):

<pre>
[remote "origin"]
    url = https://github.com/kenrussell/webgl-animometer.git
    fetch = +refs/heads/*:refs/remotes/origin/*
    <b>push = +refs/heads/master:refs/heads/gh-pages</b>
    <b>push = +refs/heads/master:refs/heads/master</b>
</pre>

# LICENSE

Portions of WebKit are licensed under the GNU LGPL and BSD licenses.
There is no license associated with Animometer's sources, so it is
assumed that Apple's standard BSD license applies, which is replicated
here:

BSD License
Copyright (C) 2009 Apple Inc. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

Redistributions of source code must retain the above copyright notice,
this list of conditions and the following disclaimer.

Redistributions in binary form must reproduce the above copyright
notice, this list of conditions and the following disclaimer in the
documentation and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY APPLE INC. AND ITS CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,
THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL APPLE INC. OR ITS
CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
