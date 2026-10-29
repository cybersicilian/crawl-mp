#pragma once

#include <memory>
#include "fixedarray.h"

// Fixed dimensions and value-copy semantics, with constant-time ownership
// exchange. Saves and consumers still address individual cells normally.
template<class T, int Width, int Height>
class owned_grid
{
    using storage = FixedArray<T, Width, Height>;
    std::unique_ptr<storage> data;

public:
    owned_grid() : data(new storage) {}
    owned_grid(const owned_grid& other) : data(new storage(*other.data)) {}
    owned_grid& operator=(const owned_grid& other)
    {
        if (this != &other)
            *data = *other.data;
        return *this;
    }
    void swap(owned_grid& other) noexcept { data.swap(other.data); }
    void init(const T& value) { data->init(value); }
    int size() const { return Width * Height; }
    int width() const { return Width; }
    int height() const { return Height; }
    bool empty() const { return !size(); }
    typename storage::Column& operator[](unsigned long x) { return (*data)[x]; }
    const typename storage::Column& operator[](unsigned long x) const { return (*data)[x]; }
    template<class Index> T& operator()(const Index& pos) { return (*data)(pos); }
    template<class Index> const T& operator()(const Index& pos) const { return (*data)(pos); }
    operator const storage&() const { return *data; }
};
