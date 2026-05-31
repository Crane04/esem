def greet(name):
    return f"Hello, {name}!"

def total(numbers):
    return sum(numbers)

def multiply(a,b):
    return a * b

def factorial(n):
    if n == 0:
        return 1
    else:
        return n * factorial(n-1)

class Counter:
    def __init__(self, start=0):
        self.value = start

    def add(self, amount=1):
        self.value += amount
        return self.value