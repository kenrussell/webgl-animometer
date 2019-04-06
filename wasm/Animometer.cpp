// Animometer benchmark ported to WebAssembly.
// Thanks to https://dawn.googlesource.com/dawn for Dawn port as reference,
// and https://github.com/timhutton/opengl-canvas-wasm for minimal WebAssembly OpenGL demo.

#include <functional>

#include <emscripten.h>
#include <SDL.h>

#define GL_GLEXT_PROTOTYPES 1
#include <SDL_opengles2.h>

#include <vector>

// Shader sources
const GLchar* vertexWithUniforms = R"(
attribute vec4 position;
attribute vec4 color;

uniform float scale;
uniform float time;
uniform float offsetX;
uniform float offsetY;
uniform float scalar;
uniform float scalarOffset;

varying vec4 v_color;

void main() {

    float fade = mod(scalarOffset + time * scalar / 10.0, 1.0);

    if (fade < 0.5) {
        fade = fade * 2.0;
    } else {
        fade = (1.0 - fade) * 2.0;
    }

    float xpos = position.x * scale;
    float ypos = position.y * scale;

    float angle = 3.14159 * 2.0 * fade;
    float xrot = xpos * cos(angle) - ypos * sin(angle);
    float yrot = xpos * sin(angle) + ypos * cos(angle);

    xpos = xrot + offsetX;
    ypos = yrot + offsetY;

    v_color = vec4(fade, 1.0 - fade, 0.0, 1.0) + color;
    gl_Position = vec4(xpos, ypos, 0.0, 1.0);
}
)";

const GLchar* fragment = R"(
precision mediump float;

varying vec4 v_color;

void main() {
    gl_FragColor = v_color;
}
)";

GLint aPosition = 0;
GLint aColor = 0;
GLint uTime = 0;
GLint uScale = 0;
GLint uOffsetX = 0;
GLint uOffsetY = 0;
GLint uScalar = 0;
GLint uScalarOffset = 0;

GLuint positionBuffer = 0;
GLuint colorBuffer = 0;

int bufferSize = 0;
int numTriangles = 20000;

struct UniformData {
    float scale;
    float time;
    float offsetX;
    float offsetY;
    float scalar;
    float scalarOffset;
};

std::vector<UniformData> uniformData;

float RandomFloat(float min, float max) {
    float zeroOne = rand() / float(RAND_MAX);
    return zeroOne * (max - min) + min;
}

// an example of something we will control from the javascript side
//bool background_is_black = true;

// the function called by the javascript code
//extern "C" void EMSCRIPTEN_KEEPALIVE toggle_background_color() { background_is_black = !background_is_black; }

std::function<void()> loop;
void main_loop() { loop(); }

bool CompileShader(GLuint shader)
{
    glCompileShader(shader);
    GLint status = 0;
    glGetShaderiv(shader, GL_COMPILE_STATUS, &status);
    if (!status) {
        printf("Compilation failed\n");
        return false;
    }
    return true;
}

void ResetIfNecessary()
{
    if (numTriangles <= bufferSize)
        return;

    if (!bufferSize)
        bufferSize = 128;

    while (numTriangles > bufferSize)
        bufferSize *= 4;

    uniformData.clear();
    for (int i = 0; i < bufferSize; ++i) {
        UniformData data;
        data.scale = RandomFloat(0.2, 0.4);
        data.time = 0;
        data.offsetX = RandomFloat(-0.9, 0.9);
        data.offsetY = RandomFloat(-0.9, 0.9);
        data.scalar = RandomFloat(0.5, 2);
        data.scalarOffset = RandomFloat(0, 10);
        uniformData.push_back(data);
    }

    // Bind for draw
    glBindBuffer(GL_ARRAY_BUFFER, positionBuffer);
    glVertexAttribPointer(aPosition, 4, GL_FLOAT, false, 0, 0);

    glBindBuffer(GL_ARRAY_BUFFER, colorBuffer);
    glVertexAttribPointer(aColor, 4, GL_FLOAT, false, 0, 0);
}

int main()
{
    SDL_Window *window;
    SDL_CreateWindowAndRenderer(1024, 768, 0, &window, nullptr);

    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 1);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 0);
    SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER, 1);
    SDL_GL_SetAttribute(SDL_GL_DEPTH_SIZE, 24);

    glClearColor(0.5f, 0.5f, 0.5f, 1.0f);

    // Create and compile the vertex shader.
    GLuint vertexShader = glCreateShader(GL_VERTEX_SHADER);
    glShaderSource(vertexShader, 1, &vertexWithUniforms, nullptr);
    if (!CompileShader(vertexShader)) {
        return EXIT_FAILURE;
    }

    // Create and compile the fragment shader
    GLuint fragmentShader = glCreateShader(GL_FRAGMENT_SHADER);
    glShaderSource(fragmentShader, 1, &fragment, nullptr);
    if (!CompileShader(fragmentShader)) {
        return EXIT_FAILURE;
    }

    // We have two compiled shaders. Time to make the program.
    GLuint program = glCreateProgram();
    glAttachShader(program, vertexShader);
    glAttachShader(program, fragmentShader);
    glLinkProgram(program);
    GLint linkStatus = 0;
    glGetProgramiv(program, GL_LINK_STATUS, &linkStatus);
    if (!linkStatus) {
        printf("Program linking failed\n");
        return EXIT_FAILURE;
    }

    // Our program has two inputs. We have a single uniform "color",
    // and one vertex attribute "position".
    glUseProgram(program);
    uTime = glGetUniformLocation(program, "time");
    uScale = glGetUniformLocation(program, "scale");
    uOffsetX = glGetUniformLocation(program, "offsetX");
    uOffsetY = glGetUniformLocation(program, "offsetY");
    uScalar = glGetUniformLocation(program, "scalar");
    uScalarOffset = glGetUniformLocation(program, "scalarOffset");

    aPosition = glGetAttribLocation(program, "position");
    glEnableVertexAttribArray(aPosition);

    aColor = glGetAttribLocation(program, "color");
    glEnableVertexAttribArray(aColor);

    glGenBuffers(1, &positionBuffer);
    glBindBuffer(GL_ARRAY_BUFFER, positionBuffer);
    GLfloat positionData[] = {
         // x y z 1
         0.0f,  0.1f, 0.0f, 1.0f,
        -0.1f, -0.1f, 0, 1,
         0.1f, -0.1f, 0, 1
    };
    glBufferData(GL_ARRAY_BUFFER, sizeof(positionData), positionData, GL_STATIC_DRAW);

    glGenBuffers(1, &colorBuffer);
    glBindBuffer(GL_ARRAY_BUFFER, colorBuffer);
    GLfloat colorData[] = {
        1, 0, 0, 1,
        0, 1, 0, 1,
        0, 0, 1, 1
    };
    glBufferData(GL_ARRAY_BUFFER, sizeof(colorData), colorData, GL_STATIC_DRAW);

    ResetIfNecessary();

    loop = [&]
    {
        glClear(GL_COLOR_BUFFER_BIT);

        const uint32_t milliseconds_since_start = SDL_GetTicks();
        float elapsedTime = milliseconds_since_start / 1000.0f;

        for (size_t i = 0; i < uniformData.size(); ++i) {
            uniformData[i].time = elapsedTime;

            glUniform1f(uScale, uniformData[i].scale);
            glUniform1f(uTime, uniformData[i].time);
            glUniform1f(uOffsetX, uniformData[i].offsetX);
            glUniform1f(uOffsetY, uniformData[i].offsetY);
            glUniform1f(uScalar, uniformData[i].scalar);
            glUniform1f(uScalarOffset, uniformData[i].scalarOffset);

            glDrawArrays(GL_TRIANGLES, 0, 3);
        }

        SDL_GL_SwapWindow(window);
    };

    emscripten_set_main_loop(main_loop, 0, true);

    return EXIT_SUCCESS;
}
