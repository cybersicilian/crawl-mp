#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include <cstdlib>
#include <memory>
#include <vector>

#include "package.h"

namespace
{
string level_like_payload()
{
    string data;
    for (int line = 0; line < 4000; ++line)
    {
        data += "cell ";
        data += to_string(line * 2654435761u);
        data += " floor rock wall\n";
    }
    return data;
}

void write_chunk(package& save, const string& name, const string& data)
{
    unique_ptr<chunk_writer> out(save.writer(name));
    out->write(data.data(), data.size());
}

string read_chunk(package& save, const string& name)
{
    unique_ptr<chunk_reader> in(save.reader(name));
    vector<char> data;
    in->read_all(data);
    return string(data.begin(), data.end());
}
}

TEST_CASE("Heroes swapping floors can rewrite a level cheaply", "[single-file]")
{
    const char* dir = getenv("TMPDIR");
    const string path = string(dir ? dir : "/tmp") + "/crawl_test_package.cs";
    const string data = level_like_payload();

    package save(path.c_str(), true, true);
    write_chunk(save, "full", data);
    save.fast_writes = true;
    write_chunk(save, "fast", data);
    save.fast_writes = false;

    // Any compression level reads back byte for byte.
    REQUIRE(read_chunk(save, "full") == data);
    REQUIRE(read_chunk(save, "fast") == data);

    // Rewrites between commits reuse their space, so a long split-floor
    // session cannot grow the save file with every swap.
    save.fast_writes = true;
    const plen_t after_first = save.get_size();
    for (int swap = 0; swap < 50; ++swap)
        write_chunk(save, "fast", data);
    save.fast_writes = false;
    REQUIRE(save.get_size() < after_first * 2);
    REQUIRE(read_chunk(save, "fast") == data);

    save.commit();
    save.unlink();
}
