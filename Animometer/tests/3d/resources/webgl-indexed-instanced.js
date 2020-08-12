(function() {

function WebGL2Supported() {
   return typeof WebGL2RenderingContext !== "undefined";
}

WebGLStage = Utilities.createSubclass(Stage,
    function(element, options)
    {
        Stage.call(this);
    },
    {

        initialize: function(benchmark, options)
        {
            Stage.prototype.initialize.call(this, benchmark, options);

            var params = new URL(location.href).searchParams;
            this._params = {
                use_attributes: Boolean(params.get("use_attributes")),
                use_ubos: Boolean(params.get("use_ubos")),
                use_multi_draw: Boolean(params.get("use_multi_draw")),
                use_base_vertex_base_instance: Boolean(params.get("use_base_vertex_base_instance")),
                webgl_version: WebGL2Supported() ? (Number(params.get("webgl_version")) || 1) : 1,
            };

            if (this._params.webgl_version == 2) {
                this._gl = this.element.getContext("webgl2");
            } else {
                this._gl = this.element.getContext("webgl");
            }
            var gl = this._gl;

            this._multi_draw = this._params.use_multi_draw && gl.getExtension("WEBGL_multi_draw");
            this._draw_base_vertex_base_instance = !this._params.use_multi_draw && this._params.use_base_vertex_base_instance && gl.getExtension("WEBGL_draw_instanced_base_vertex_base_instance");
            this._multi_draw_base_vertex_base_instance = this._params.use_multi_draw && this._params.use_base_vertex_base_instance && gl.getExtension("WEBGL_multi_draw_instanced_base_vertex_base_instance");
            // if (this._params.use_base_vertex_base_instance && !this._multi_draw_base_vertex_base_instance) {
            if ( this._params.use_base_vertex_base_instance && !(this._draw_base_vertex_base_instance || this._multi_draw_base_vertex_base_instance) ) {
                console.warn("Disabling use_base_vertex_base_instance. Extension not available.");
                this._params.use_base_vertex_base_instance = false;
            }
            if (this._params.use_multi_draw && !this._multi_draw) {
                console.warn("Disabling use_multi_draw. Extension not available.");
                this._params.use_multi_draw = false;
            }
            if (this._params.use_ubos && this._params.webgl_version !== 2) {
                console.warn("Disabling use_ubos. webgl_version is not 2.");
                this._params.use_ubos = false;
            }
            if (this._params.use_ubos && !this._params.use_multi_draw) {
                console.warn("Disabling use_ubos. use_multi_draw not enabled.");
                this._params.use_ubos = false;
            }
            if (this._params.use_multi_draw && !(this._params.use_ubos || this._params.use_attributes)) {
                const flag = this._params.webgl_version == 2 ? "use_ubos" : "use_attributes";
                console.warn("Defaulting to " + flag);
                this._params[flag] = true;
            }

            this._numTriangles = 0;
            this._bufferSize = 0;

            // storing object id (order in the index buffer) that needs rendering for current frame
            this._drawList = [];
            // this._drawListRatio = 0.5;
            this._drawListUpdateFrameInterval = 50;
            // this._drawListUpdateFrameInterval = 20;
            // this._drawListUpdateFrameInterval = 10;
            // this._drawListUpdateFrameInterval = 5;
            this._drawListUpdateCountdown = this._drawListUpdateFrameInterval;
            this._numDrawingObjects = 0;

            // temp test
            this._drawListSet = [];
            this._curDrawListId = 0;
            // this._drawListSet.push(Array())
            // for (let i = 0; i < 5; i++) {
            //     let list = [];
            //     this._drawListSet[i] = list;
            // }

            var use_ubos = this._params.use_ubos;
            var use_attributes = this._params.use_attributes;

            gl.clearColor(0.5, 0.5, 0.5, 1);

            // Create the vertex shader object.
            var vertexShader = gl.createShader(gl.VERTEX_SHADER);

            // The source code for the shader is extracted from the <script> element above.
            if (use_ubos) {
                let source = this._getFunctionSource("vertex-with-ubos");
                this._maxUniformArraySize = Math.floor(
                    gl.getParameter(gl.MAX_UNIFORM_BLOCK_SIZE) /
                    (8 * Float32Array.BYTES_PER_ELEMENT));
                source = source.replace('MAX_ARRAY_SIZE', this._maxUniformArraySize);
                gl.shaderSource(vertexShader, source);
            } else if (use_attributes) {
                gl.shaderSource(vertexShader, this._getFunctionSource("vertex-with-attributes"));
            } else {
                gl.shaderSource(vertexShader, this._getFunctionSource("vertex-with-uniforms"));
            }

            // Compile the shader.
            gl.compileShader(vertexShader);
            if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
                // We failed to compile. Output to the console and quit.
                console.error("Vertex Shader failed to compile.");
                console.error(gl.getShaderInfoLog(vertexShader));
                return;
            }

            // Now do the fragment shader.
            var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
            if (use_ubos) {
                gl.shaderSource(fragmentShader, this._getFunctionSource("fragment-300es"));
            } else {
                gl.shaderSource(fragmentShader, this._getFunctionSource("fragment"));
            }
            gl.compileShader(fragmentShader);
            if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
                console.error("Fragment Shader failed to compile.");
                console.error(gl.getShaderInfoLog(fragmentShader));
                return;
            }

            // We have two compiled shaders. Time to make the program.
            var program = gl.createProgram();
            gl.attachShader(program, vertexShader);
            gl.attachShader(program, fragmentShader);
            gl.linkProgram(program);

            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                console.error("Unable to link shaders into program.");
                console.error(gl.getProgramInfoLog(program));
                return;
            }

            // Our program has two inputs. We have a single uniform "color",
            // and one vertex attribute "position".

            gl.useProgram(program);
            this._uTime = gl.getUniformLocation(program, "time");
            if (use_ubos) {
                const blockIndex = gl.getUniformBlockIndex(program, "DrawData");
                gl.uniformBlockBinding(program, blockIndex, 0);
            } else if (use_attributes) {
                this._aScale = gl.getAttribLocation(program, "scale");
                this._aOffsetX = gl.getAttribLocation(program, "offsetX");
                this._aOffsetY = gl.getAttribLocation(program, "offsetY");
                this._aScalar = gl.getAttribLocation(program, "scalar");
                this._aScalarOffset = gl.getAttribLocation(program, "scalarOffset");

                gl.enableVertexAttribArray(this._aScale);
                gl.enableVertexAttribArray(this._aOffsetX);
                gl.enableVertexAttribArray(this._aOffsetY);
                gl.enableVertexAttribArray(this._aScalar);
                gl.enableVertexAttribArray(this._aScalarOffset);
            } else {
                this._uScale = gl.getUniformLocation(program, "scale");
                this._uOffsetX = gl.getUniformLocation(program, "offsetX");
                this._uOffsetY = gl.getUniformLocation(program, "offsetY");
                this._uScalar = gl.getUniformLocation(program, "scalar");
                this._uScalarOffset = gl.getUniformLocation(program, "scalarOffset");
            }

            this._aPosition = gl.getAttribLocation(program, "position");
            gl.enableVertexAttribArray(this._aPosition);

            this._aColor = gl.getAttribLocation(program, "color");
            gl.enableVertexAttribArray(this._aColor);

            this._positionData = new Float32Array([
                // x y z 1
                   0,  0.1, 0, 1,
                -0.1, -0.1, 0, 1,
                 0.1, -0.1, 0, 1
            ]);

            this._colorData = new Float32Array([
                1, 0, 0, 1,
                0, 1, 0, 1,
                0, 0, 1, 1
            ]);

            this._indexData = new Uint16Array([
                0, 1, 2
                // 3, 4, 5
                // 6, 7, 8
            ]);

            // if (!use_attributes && !use_ubos) {
            //     this._positionBuffer = gl.createBuffer();
            //     gl.bindBuffer(gl.ARRAY_BUFFER, this._positionBuffer);
            //     gl.bufferData(gl.ARRAY_BUFFER, this._positionData, gl.STATIC_DRAW);

            //     this._colorBuffer = gl.createBuffer();
            //     gl.bindBuffer(gl.ARRAY_BUFFER, this._colorBuffer);
            //     gl.bufferData(gl.ARRAY_BUFFER, this._colorData, gl.STATIC_DRAW);

            //     this._indexBuffer = gl.createBuffer();
            //     gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);
            //     gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._indexData, gl.STATIC_DRAW);
            // }

            // this._resetIfNecessary();
        },

        _getFunctionSource: function(id)
        {
            return document.getElementById(id).text;
        },

        _resetIfNecessary: function()
        {
            var gl = this._gl;
            if (this._numTriangles <= this._bufferSize)
                return;

            if (!this._bufferSize)
                this._bufferSize = 128;

            while (this._numTriangles > this._bufferSize)
                this._bufferSize *= 4;

            // this._drawListSet.push([...Array(this._numTriangles).keys()]);
            this._drawListSet.push([0, 10, 20, 30]);    // all wrong
            // this._drawListSet.push([10]);
            // this._drawListSet.push([0,1,2,3,4,5,6,7,8,9,10]);    // mbvbi = raw, m has wrong shape(id offset)
            // this._drawListSet.push([...Array(this._numTriangles / 4).keys()]);
            // this._drawListSet.push([...Array(this._numTriangles / 2).keys()].map(x => x + 100));
            // this._drawListSet.push([...Array(this._numTriangles / 8).keys()].map(x => x * 4));
            // console.log(this._drawListSet);

            var use_attributes = this._params.use_attributes;
            var use_ubos = this._params.use_ubos;
            var use_multi_draw = this._params.use_multi_draw;
            var use_base_vertex_base_instance = this._params.use_base_vertex_base_instance;

            var positionData = new Float32Array(this._bufferSize * this._positionData.length);
            var colorData = new Float32Array(this._bufferSize * this._colorData.length);
            var indexData = new Uint16Array(this._bufferSize * this._indexData.length);

            for (let i = 0; i < this._bufferSize; ++i) {
                // positionData.set(this._positionData, i * this._positionData.length);

                let offset = i * this._positionData.length;
                for (let j = 0; j < this._positionData.length; j+=4) {
                    // each position is vec4
                    // creating trangles of (pseudo) random shapes
                    let s = Stage.random(0.1, 2.0);
                    positionData[offset + j] = this._positionData[j + 0] * s;
                    positionData[offset + j + 1] = this._positionData[j + 1] * s;
                    positionData[offset + j + 2] = this._positionData[j + 2];
                    positionData[offset + j + 3] = this._positionData[j + 3];
                }

                colorData.set(this._colorData, i * this._colorData.length);
                // indexData.set(this._indexData, i * this._indexData.length);
            }

            // if (use_multi_draw || use_base_vertex_base_instance) {
            //     // this._multi_draw_firsts = new Int32Array(this._bufferSize);
            //     this._multi_draw_counts = new Int32Array(this._bufferSize);
            //     this._multi_draw_offsets = new Int32Array(this._bufferSize);

            //     // this._multi_draw_offsets_dynamic = new Int32Array(this._bufferSize);

            //     if (use_base_vertex_base_instance) {
            //         // actually only use base vertex
            //         this._multi_draw_instance_counts = new Int32Array(this._bufferSize);
            //         this._multi_draw_instance_counts.fill(1);
            //         this._multi_draw_base_vertices = new Int32Array(this._bufferSize);
            //         this._multi_draw_base_vertices_dynamic = new Int32Array(this._bufferSize);
            //         // this._multi_draw_base_vertices.fill(0);
            //         this._multi_draw_base_instances = new Uint32Array(this._bufferSize);
            //         this._multi_draw_base_instances.fill(0);

            //         for (let i = 0; i < this._bufferSize; ++i) {
            //             this._multi_draw_base_vertices[i] = i * 3;  // all triangles, 3 vertices
            //         }

            //         this._multi_draw_offsets.fill(0);
            //     } else {
            //         this._multi_draw_offsets_dynamic = new Int32Array(this._bufferSize);
            //         for (let i = 0; i < this._bufferSize; ++i) {
            //             // this._multi_draw_firsts[i] = i * 3;
            //             this._multi_draw_offsets[i] = i * 2 * 3;    // in bytes, for index buffer
    
            //             // this._multi_draw_base_vertices[i] = i * 3;  // all triangles, 3 vertices
            //         }
            //     }

                
            //     this._multi_draw_counts.fill(3);
            // }

            // this._multi_draw_firsts = new Int32Array(this._bufferSize);
            this._multi_draw_counts = new Int32Array(this._bufferSize);
            this._multi_draw_offsets = new Int32Array(this._bufferSize);

            // this._multi_draw_offsets_dynamic = new Int32Array(this._bufferSize);

            if (use_base_vertex_base_instance) {
                // actually only use base vertex
                this._multi_draw_instance_counts = new Int32Array(this._bufferSize);
                this._multi_draw_instance_counts.fill(1);
                this._multi_draw_base_vertices = new Int32Array(this._bufferSize);
                this._multi_draw_base_vertices_dynamic = new Int32Array(this._bufferSize);
                // this._multi_draw_base_vertices.fill(0);
                this._multi_draw_base_instances = new Uint32Array(this._bufferSize);
                this._multi_draw_base_instances.fill(0);

                for (let i = 0; i < this._bufferSize; ++i) {
                    this._multi_draw_base_vertices[i] = i * 3;  // all triangles, 3 vertices
                }

                this._multi_draw_offsets.fill(0);
            } else {
                // this._multi_draw_offsets_dynamic = new Int32Array(this._bufferSize);
                for (let i = 0; i < this._bufferSize; ++i) {
                    // this._multi_draw_firsts[i] = i * 3;

                    // in bytes (UNSIGNED_SHORT), for index buffer
                    this._multi_draw_offsets[i] = i * 2 * 3;

                    // this._multi_draw_base_vertices[i] = i * 3;  // all triangles, 3 vertices
                }
            }
            
            // Currently all our testing geometries are triangles. But they don't have to be
            this._multi_draw_counts.fill(3);

            // if (use_multi_draw || use_attributes) {
                
            //     if (!use_base_vertex_base_instance) {
            //         // indexData = new Uint16Array(this._bufferSize * this._indexData.length);
            //         this._currentIndexData = new Uint16Array(this._bufferSize * this._indexData.length);
            //         this._originalIndexData = indexData;
                    
            //         // Indices data here are added with extra offset
            //         // They need no update after setup
            //         for (let i = 0; i < this._bufferSize; ++i) {
            //             // indexData.set(this._indexData, i * this._indexData.length);
            //             let o = i * 3;  // assume this._indexData.length = 3;
            //             indexData[o] = this._indexData[0] + o;
            //             indexData[o + 1] = this._indexData[1] + o;
            //             indexData[o + 2] = this._indexData[2] + o;
            //         }
            //     }
            //     else
            //     {
            //         // // This is temporary usage which assume all primitives having same indexData (triangle)
            //         // indexData = this._indexData;

            //         // Directly copy the original indexData into indexBuffer
            //         for (let i = 0; i < this._bufferSize; ++i) {
            //             indexData.set(this._indexData, i * this._indexData.length);
            //         }
            //     }

            // }

            if (!use_base_vertex_base_instance) {
                // indexData = new Uint16Array(this._bufferSize * this._indexData.length);
                this._currentIndexData = new Uint16Array(this._bufferSize * this._indexData.length);
                this._originalIndexData = indexData;
                
                // Indices data here are added with extra offset
                for (let i = 0; i < this._bufferSize; ++i) {
                    // indexData.set(this._indexData, i * this._indexData.length);
                    
                    let o = i * 3;  // assume this._indexData.length = 3;
                    let indexOffset = 
                    indexData[o] = this._indexData[0] + o;
                    indexData[o + 1] = this._indexData[1] + o;
                    indexData[o + 2] = this._indexData[2] + o;
                }
            }
            else
            {
                // // This is temporary usage which assume all primitives having same indexData (triangle)
                // indexData = this._indexData;

                // Directly copy the original indexData into indexBuffer
                for (let i = 0; i < this._bufferSize; ++i) {
                    indexData.set(this._indexData, i * this._indexData.length);
                }
            }

            console.log(this._bufferSize);

            if (use_ubos) {
                this._transformData = new Float32Array(this._bufferSize * 8);
                for (let i = 0; i < this._bufferSize; ++i) {
                    var scale = Stage.random(0.2, 0.4);
                    var offsetX = Stage.random(-0.9, 0.9);
                    var offsetY = Stage.random(-0.9, 0.9);
                    var scalar = Stage.random(0.5, 2);
                    var scalarOffset = Stage.random(0, 10);

                    this._transformData[i * 8 + 0] = scale;
                    this._transformData[i * 8 + 1] = offsetX;
                    this._transformData[i * 8 + 2] = offsetY;
                    this._transformData[i * 8 + 3] = scalar;
                    this._transformData[i * 8 + 4] = scalarOffset;
                }

                console.log(this._transformData[10 * 8 + 0]);
                console.log(this._transformData[10 * 8 + 1]);
                console.log(this._transformData[10 * 8 + 2]);
                console.log(this._transformData[10 * 8 + 3]);
                console.log(this._transformData[10 * 8 + 4]);

                const uniformBufferCount = Math.ceil(this._bufferSize / this._maxUniformArraySize);
                this._uniformBuffers = new Array(uniformBufferCount);
                for (let i = 0; i < uniformBufferCount; ++i) {
                    const buffer = gl.createBuffer();
                    gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
                    gl.bufferData(gl.UNIFORM_BUFFER, this._transformData.slice(
                      this._maxUniformArraySize * 8 * i,
                      this._maxUniformArraySize * 8 * (i + 1),
                    ), gl.STATIC_DRAW);
                    gl.bindBuffer(gl.UNIFORM_BUFFER, null);
                    this._uniformBuffers[i] = buffer;
                }

            } else if (use_attributes) {
                this._transformData = new Float32Array(this._bufferSize * 5 * 3);
                for (let i = 0; i < this._bufferSize; ++i) {
                    var scale = Stage.random(0.2, 0.4);
                    var offsetX = Stage.random(-0.9, 0.9);
                    var offsetY = Stage.random(-0.9, 0.9);
                    var scalar = Stage.random(0.5, 2);
                    var scalarOffset = Stage.random(0, 10);
                    for (let j = 0; j < 3; ++j) {
                        this._transformData[i * 3 * 5 + j * 5 + 0] = scale;
                        this._transformData[i * 3 * 5 + j * 5 + 1] = offsetX;
                        this._transformData[i * 3 * 5 + j * 5 + 2] = offsetY;
                        this._transformData[i * 3 * 5 + j * 5 + 3] = scalar;
                        this._transformData[i * 3 * 5 + j * 5 + 4] = scalarOffset;
                    }
                }

                this._transformBuffer = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, this._transformBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, this._transformData, gl.STATIC_DRAW);

                gl.bindBuffer(gl.ARRAY_BUFFER, this._transformBuffer);
                gl.vertexAttribPointer(this._aScale,        1, gl.FLOAT, false, 5 * 4, 0 * 4);
                gl.vertexAttribPointer(this._aOffsetX,      1, gl.FLOAT, false, 5 * 4, 1 * 4);
                gl.vertexAttribPointer(this._aOffsetY,      1, gl.FLOAT, false, 5 * 4, 2 * 4);
                gl.vertexAttribPointer(this._aScalar,       1, gl.FLOAT, false, 5 * 4, 3 * 4);
                gl.vertexAttribPointer(this._aScalarOffset, 1, gl.FLOAT, false, 5 * 4, 4 * 4);
            } else {
                this._uniformData = new Float32Array(this._bufferSize * 6);
                for (let i = 0; i < this._bufferSize; ++i) {
                    this._uniformData[i * 6 + 0] = Stage.random(0.2, 0.4);
                    this._uniformData[i * 6 + 1] = 0;
                    this._uniformData[i * 6 + 2] = Stage.random(-0.9, 0.9);
                    this._uniformData[i * 6 + 3] = Stage.random(-0.9, 0.9);
                    this._uniformData[i * 6 + 4] = Stage.random(0.5, 2);
                    this._uniformData[i * 6 + 5] = Stage.random(0, 10);
                }

                console.log(this._uniformData[10 * 6 + 0]);
                // console.log(this._uniformData[10 * 6 + 1]);
                console.log(this._uniformData[10 * 6 + 2]);
                console.log(this._uniformData[10 * 6 + 3]);
                console.log(this._uniformData[10 * 6 + 4]);
                console.log(this._uniformData[10 * 6 + 5]);
            }

            this._positionBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this._positionBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, positionData, gl.STATIC_DRAW);
            gl.vertexAttribPointer(this._aPosition, 4, gl.FLOAT, false, 0, 0);

            this._colorBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this._colorBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, colorData, gl.STATIC_DRAW);
            gl.vertexAttribPointer(this._aColor, 4, gl.FLOAT, false, 0, 0);

            this._indexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexData, gl.DYNAMIC_DRAW);
            // gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexData, use_base_vertex_base_instance ? gl.STATIC_DRAW : gl.DYNAMIC_DRAW);

            // // Bind for draw
            // gl.bindBuffer(gl.ARRAY_BUFFER, this._positionBuffer);
            // gl.vertexAttribPointer(this._aPosition, 4, gl.FLOAT, false, 0, 0);

            // gl.bindBuffer(gl.ARRAY_BUFFER, this._colorBuffer);
            // gl.vertexAttribPointer(this._aColor, 4, gl.FLOAT, false, 0, 0);

            // gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);


            // this._updateDrawList(gl);
        },

        tune: function(count)
        {
            if (!count)
                return;

            this._numTriangles += count;
            this._numTriangles = Math.max(this._numTriangles, 0);

            this._resetIfNecessary();
        },

        animate: function(timeDelta)
        {
            var gl = this._gl;

            gl.clear(gl.COLOR_BUFFER_BIT);

            this._updateDrawList(gl);

            // this._drawListUpdateCountdown--;
            // // if (this._drawListUpdateCountdown > 0) {
            // //     return;
            // // } else {
            // if (this._drawListUpdateCountdown <= 0) {
            //     this._drawListUpdateCountdown = this._drawListUpdateFrameInterval;
            //     this._curDrawListId = (this._curDrawListId + 1) % this._drawListSet.length;

            //     // this._curDrawListId = 0;
            // }

            // this._drawList = this._drawListSet[this._curDrawListId];
            // this._numDrawingObjects = this._drawList.length;



            if (!this._startTime)
                this._startTime = Stage.dateCounterValue(1000);
            var elapsedTime = Stage.dateCounterValue(1000) - this._startTime;

            // tmp test static
            elapsedTime = 0;

            if (this._params.use_multi_draw) {
                gl.uniform1f(this._uTime, elapsedTime);
                if (this._params.use_ubos) {
                    let remainingDrawCount = this._numDrawingObjects;

                    // for (let chunk = 0; chunk < Math.ceil(this._numTriangles / this._maxUniformArraySize); chunk++) {
                    for (let chunk = 0, count = Math.ceil(this._numDrawingObjects / this._maxUniformArraySize); chunk < count; chunk++) {
                        
                        gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this._uniformBuffers[chunk]);
                        
                        if (this._params.use_base_vertex_base_instance) {
                            this._multi_draw_base_vertex_base_instance.multiDrawElementsInstancedBaseVertexBaseInstanceWEBGL(
                                gl.TRIANGLES,
                                this._multi_draw_counts, chunk * this._maxUniformArraySize,
                                gl.UNSIGNED_SHORT,
                                this._multi_draw_offsets, chunk * this._maxUniformArraySize,
                                // this._multi_draw_offsets_dynamic, chunk * this._maxUniformArraySize,
                                this._multi_draw_instance_counts, 0,
                                // this._multi_draw_base_vertices, 0,
                                this._multi_draw_base_vertices_dynamic, 0,
                                this._multi_draw_base_instances, 0,
                                Math.min(this._maxUniformArraySize, remainingDrawCount));
                                // 1);
                            
                            remainingDrawCount -= this._maxUniformArraySize;

                            // this._multi_draw_base_vertex_base_instance.multiDrawElementsInstancedBaseVertexBaseInstanceWEBGL(
                            //     gl.TRIANGLES,
                            //     this._multi_draw_counts, chunk * this._maxUniformArraySize,
                            //     gl.UNSIGNED_SHORT,
                            //     this._multi_draw_offsets, chunk * this._maxUniformArraySize,
                            //     // this._multi_draw_offsets_dynamic, chunk * this._maxUniformArraySize,
                            //     this._multi_draw_instance_counts, 0,
                            //     this._multi_draw_base_vertices, 0,
                            //     // this._multi_draw_base_vertices_dynamic, 0,
                            //     this._multi_draw_base_instances, 0,
                            //     this._numDrawingObjects);
                        } else {
                            this._multi_draw.multiDrawElementsWEBGL(
                                gl.TRIANGLES,
                                this._multi_draw_counts, chunk * this._maxUniformArraySize,
                                gl.UNSIGNED_SHORT,
                                this._multi_draw_offsets, chunk * this._maxUniformArraySize,
                                Math.min(this._maxUniformArraySize, remainingDrawCount));
                        }
                    }
                } else {
                    this._multi_draw.multiDrawElementsWEBGL(
                        gl.TRIANGLES,
                        this._multi_draw_counts, chunk * this._maxUniformArraySize,
                        gl.UNSIGNED_SHORT,
                        this._multi_draw_offsets, chunk * this._maxUniformArraySize,
                        this._numTriangles);
                    // this._multi_draw.multiDrawArraysWEBGL(
                    //     gl.TRIANGLES,
                    //     this._multi_draw_firsts, 0,
                    //     this._multi_draw_counts, 0,
                    //     this._numTriangles);
                }
            } else if (this._params.use_attributes) {
                gl.uniform1f(this._uTime, elapsedTime);

                if (this._params.use_base_vertex_base_instance) {
                    for (let i = 0; i < this._numDrawingObjects; ++i) {
                        let oid = this._drawList[i];
                        this._draw_base_vertex_base_instance.drawElementsInstancedBaseVertexBaseInstanceWEBGL(
                            gl.TRIANGLES,
                            this._multi_draw_counts[oid],
                            // 3,  // temp
                            gl.UNSIGNED_SHORT,
                            this._multi_draw_offsets[oid],
                            1,
                            this._multi_draw_base_vertices[oid],
                            0
                        );
                    }
                    
                } else {
                    for (let i = 0; i < this._numTriangles; ++i) {
                        // drawList, drawElements
                        gl.drawArrays(gl.TRIANGLES, i * 3, 3);
                    }
                }

                
            } else {
                // for (let i = 0; i < this._numTriangles; ++i) {
                for (let i = 0; i < this._numDrawingObjects; ++i) {
                    let oid = this._drawList[i];
                    this._uniformData[oid * 6 + 1] = elapsedTime;

                    var uniformDataOffset = oid * 6;
                    gl.uniform1f(this._uScale, this._uniformData[uniformDataOffset++]);
                    gl.uniform1f(this._uTime, this._uniformData[uniformDataOffset++]);
                    gl.uniform1f(this._uOffsetX, this._uniformData[uniformDataOffset++]);
                    gl.uniform1f(this._uOffsetY, this._uniformData[uniformDataOffset++]);
                    gl.uniform1f(this._uScalar, this._uniformData[uniformDataOffset++]);
                    gl.uniform1f(this._uScalarOffset, this._uniformData[uniformDataOffset++]);

                    // gl.drawArrays(gl.TRIANGLES, 0, 3);
                    // console.log("ffff");
                    gl.drawElements(gl.TRIANGLES, 3, gl.UNSIGNED_SHORT, this._multi_draw_offsets[oid]);
                }
            }
        },

        _updateDrawList: function(gl)
        {
            this._drawListUpdateCountdown--;
            if (this._drawListUpdateCountdown > 0) {
                return;
            } else {
                this._drawListUpdateCountdown = this._drawListUpdateFrameInterval;
            }

            this._curDrawListId = (this._curDrawListId + 1) % this._drawListSet.length;

            // this._curDrawListId = 0;

            this._drawList = this._drawListSet[this._curDrawListId];
            this._numDrawingObjects = this._drawList.length;


            if (this._params.use_base_vertex_base_instance && this._params.use_multi_draw) {
                let id;
                for (let i = 0; i < this._numDrawingObjects; i++) {
                    id = this._drawList[i];
                    // this._multi_draw_offsets_dynamic[i] = this._multi_draw_offsets[id];
                    this._multi_draw_base_vertices_dynamic[i] = this._multi_draw_base_vertices[id];
                }
            }
            // update this._multi_draw_counts data etc.
            else if (this._params.use_multi_draw) {
                // this._multi_draw_counts; // currently all triangle reamin at 3    

                for (let i = 0; i < this._numDrawingObjects; i++) {
                    id = this._drawList[i];
                    // this._multi_draw_offsets_dynamic[i] = this._multi_draw_offsets[id];
                    // update index data and upload
                    let o = i * 3;
                    let oid = id * 3;
                    //
                    this._currentIndexData[o] = this._originalIndexData[oid] + oid;
                    this._currentIndexData[o + 1] = this._originalIndexData[oid + 1] + oid;
                    this._currentIndexData[o + 2] = this._originalIndexData[oid + 2] + oid;
                }
                gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, this._currentIndexData, 0, this._numDrawingObjects * 3);
            }
            else
            {
                // not using multi_draw
                // no need to update draw list data
            }
        },

        complexity: function()
        {
            return this._numTriangles;
        }
    }
);

WebGLBenchmark = Utilities.createSubclass(Benchmark,
    function(options)
    {
        Benchmark.call(this, new WebGLStage(), options);
    }
);

window.benchmarkClass = WebGLBenchmark;

})();


